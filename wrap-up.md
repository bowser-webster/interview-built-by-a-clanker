# wrap-up.md — state of the review-and-fix pass

_Written 2026-09-23 at the stopping point. Branch `fix/review-findings` on the fork
https://github.com/bowser-webster/interview-built-by-a-clanker (upstream chain: `mslavin-eci/…` → `eci-global/…`)._

## TL;DR
- **What this repo is.** A debugging assessment: "Agentic Personas Storefront" (pnpm + Turborepo; Fastify API,
  React/TanStack web, shared Zod package). The README says it "was recently working" and that bugs were planted
  across all three packages. We found them by review, then fixed them test-first.
- **What was done.**
  - Every **Critical / High / Medium** finding that had evidence is fixed: 3 Critical, 9 High, 9 Medium, plus
    3 regressions our own fixes caused (E1–E3) and 1 test gap (NS-M1).
  - Each fix went in its own group commit, with a failing test written first.
  - Went from **0 tests to 84** (api 53, web 31).
- **What was not done.** 42 known **Low** items and test gaps are deliberately deferred.
  - Each has an exact location and a suggested next step in [`NEXT-Steps.md`](NEXT-Steps.md).
  - Side effects our fixes caused or exposed are logged, with the reasons, in [`error.md`](error.md).
- **Where it lives.** Nothing is merged to `main` and no PR is open. The branch is pushed to the fork as grouped commits.

---

## 1. Current standing — validated 2026-09-23 at `93838c0`

| Gate | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | ✅ |
| Build | `pnpm build --force` | ✅ 3/3 tasks, 0 cached |
| Typecheck | `pnpm typecheck --force` | ✅ 4/4 (web typecheck was **failing** on original `main`, M8) |
| Unit/integration tests | `pnpm exec turbo test --force` | ✅ **api 53/53** (8 files), **web 31/31** (7 files) |
| Lint | `pnpm lint` | ⚠️ passes but checks nothing: no linter is configured (NS-L29) |
| API smoke, both auth modes | `pnpm smoke:api` | ✅ 0 × 5xx; every invariant in §4 holds |
| E2E smoke, real Chromium | `pnpm smoke:e2e A`, restart API, `pnpm smoke:e2e B` | ✅ **15/15** |
| E2E exploratory | `pnpm smoke:explore` | ✅ 27 OK, 1 flag = known Low NS-L16 (duplicate star gradient ids) |

Where the evidence is:
- `docs/evidence/`: API smoke transcripts for original `main`, after round 1 and after round 2; the round-2 mutation log;
  E2E JSON results; screenshots.
- `docs/evidence/probes/`: re-runnable reproductions for `error.md`.

---

## 2. What changed

### 2.1 Findings fixed (production code)
**Evidence** is how we knew the finding was real before fixing it; every row also has a failing test written first (in its group commit).
Commits are the group merge on `fix/review-findings`.

| ID | Sev | Problem (before) | Fix | Where | Commit |
|---|---|---|---|---|---|
| C1 | Crit | Auth off by default (`ENFORCE_AUTH` opt-in), so `request.user` was null and **every protected route returned 500**, even with a valid token | Flag kept, **defaults ON** (`!== "false"`) | `api/src/middleware/auth.ts` | `1905963` |
| C2 | Crit | `DELETE /cart/:itemId` had no ownership check (IDOR); cart ids are sequential | Same guard as PUT, **404** (not 403) | `api/src/routes/cart.ts` | `6f37539` |
| C3 | Crit | Hardcoded JWT secret, tokens never expired, so anyone could forge a token | `JWT_SECRET` env, else a **random per-boot secret**; `expiresIn: "1h"` | `api/src/app.ts` | `1905963` |
| H1 | High | CORS omitted DELETE | Added DELETE | `api/src/app.ts` | `1905963` |
| H2 | High | `minPrice` filter used `<=` (it acted as a second max) | `>=`, inclusive | `api/src/db.ts` | `c2f0c62` |
| H3 | High | Checkout never cleared the cart, so it could be checked out again | `clearForUser` after creating the order | `api/src/routes/checkout.ts` | `6f37539` |
| H4 | High | Unsalted 32-bit password hash, so different passwords collided | `scrypt` + per-user salt + `timingSafeEqual` | `api/src/routes/auth.ts` | `1905963` |
| H5 | High | Favorite toggle inverted | POST when not favorited, DELETE when favorited | `web/src/routes/personas/$personaId.tsx` | `898a2bd` |
| H6 | High | Browse query key ignored filters, so search/filter/sort never refetched | `queryKey: ["personas", search]` | `web/src/routes/index.tsx` | `42044a2` |
| H7 | High | Card price ×100 ($49.99 showed as $4999.00) | `price.toFixed(2)` | `web/src/components/PersonaCard.tsx` | `42044a2` |
| H8 | High | `["favorites"]` cached two shapes, which crashed the detail page | One shape; the detail page derives ids with `select` | `$personaId.tsx` | `898a2bd` |
| H9 | High | Logout left the token and query cache; a reload signed you back in; user B saw user A's cart | `endSession` removes the token and calls `queryClient.clear()`; login also clears the cache | `web/src/lib/auth.tsx` | `026f1c2` |
| M1 | Med | Login response lacked `username` (broke `AuthResponse`) | Return `{id, username, email}` | `api/src/routes/auth.ts` | `1905963` |
| M2 | Med | User ids `user-N` restarted at 1 after a reboot, so an old token became a different user | `user-<uuid>` (and the per-boot secret) | `api/src/routes/auth.ts` | `1905963` |
| M3 | Med | Query params unvalidated; `?q=a&q=b` → 500 | `personaFilterSchema.safeParse` → 400; min>max → 400 | `api/src/routes/personas.ts` | `c2f0c62` |
| M4 | Med | `POST /favorites` unvalidated; a missing or null body → 500 | Shared `addFavoriteSchema` → 400 | `api/src/routes/favorites.ts`, `shared/src/schemas/favorite.ts` | `c2f0c62` |
| M5 | Med | Unbounded quantity; `1e308` → `"total": null` | Cap **99** in the schemas + merge check | `shared/src/schemas/cart.ts`, `api/src/routes/cart.ts` | `6f37539` |
| M6 | Med | Cart badge key `["cart-count"]` was never invalidated | Key `["cart","count"]` (under the `["cart"]` prefix) | `web/src/routes/__root.tsx` | `75dadf4` |
| M7 | Med | Zod 400s showed "[object Object]" | Readable `field: message` text | `web/src/lib/api.ts` | `7c9c2a3` |
| M8 | Med | `pnpm typecheck` failed (TS4023, unexported `SearchParams`) | `export interface SearchParams` | `web/src/routes/index.tsx` | `7c9c2a3` |
| M9 | Med | Cart "−" at qty 1 sent 0 (a silent 400) | Disabled at quantity 1 | `web/src/components/CartItem.tsx` | `75dadf4` |
| E1 | High | **Caused by H1:** every browser DELETE got a 400 (JSON content-type with no body) | Only send `Content-Type` when there is a body | `web/src/lib/api.ts` | `8f2728e` |
| E2 | Med | **Caused by H4:** an `await` between the dup-email check and create → two accounts, one email | Hash first, then check-and-create with no await in between | `api/src/routes/auth.ts` | `8f2728e` |
| E3 | Med | **Caused by C3:** no 401 handling → UI looked logged in and showed empty pages | Global 401 → end the session (except login/register 401s) | `web/src/lib/api.ts`, `auth.tsx` | `026f1c2` |
| L5 | Low | Stale `/auth/me` 401 could delete a freshly issued token | Ignore results for a token that is no longer current | `web/src/lib/auth.tsx` | `026f1c2` |
| NS-M1 | test | PUT ownership guard (C2's sibling) had no test; the mutation survived | Cross-user PUT test (RED with the mutation applied) | `api/test/cart.test.ts` | `d255752` |

### 2.2 Infrastructure added
- **API test harness** (`5bcddb1`):
  - Fastify setup moved from `index.ts` into `buildApp()` in `api/src/app.ts`; `index.ts` only calls `listen`.
  - vitest + `fastify.inject`.
  - `test/helpers.ts`: `freshApp()` uses `vi.resetModules()` so every test gets fresh in-memory state.
- **Web test harness** (`a25326a`): jsdom + Testing Library.
  - `src/test/renderApp.tsx` mounts the **real** route tree, AuthProvider and query cache.
  - `stubApi()` records every request.
- **Portable smoke tooling** (`93838c0`):
  - `scripts/api-smoke.mjs`, `scripts/e2e-smoke.cjs`, `scripts/e2e-explore.cjs`, wired as `pnpm smoke:*`.
  - `playwright` pinned as a root devDependency.
  - Output goes to `.smoke-output/` (gitignored).
- **Docs:** `error.md`, `NEXT-Steps.md`, `docs/evidence/`, this file.

### 2.3 Behaviour changes a future dev must know
- **Tokens expire after 1h.** Without `JWT_SECRET`, every API restart invalidates all tokens (random per-boot secret).
  - The web app now ends the session on 401.
  - **Under `pnpm dev`, every API file save signs you out**, because turbo's strict env mode strips `JWT_SECRET` (NS-L23, the top next item).
- **`ENFORCE_AUTH=false` does not bypass auth; it makes protected routes return 500** (NS-L9). Only the exact string `"false"` disables it.
- **Cart quantity is capped at 99** per line. The UI doesn't show the error yet (NS-L13).
- **`POST /favorites` and `GET /personas` 400 bodies** are now zod `flatten()` objects, not strings.
- **`GET /personas?maxPrice=`** (an empty value) now filters to `[]`, because `z.coerce` turns `""` into 0 (NS-L10).
  The web client never sends empty values.
- **User ids** are `user-<uuid>`. Cart ids and order ids are still sequential (`cart-N`, `order-N`).

---

## 3. What was not changed (and why)
All of it is in [`NEXT-Steps.md`](NEXT-Steps.md): **42 open items**, each with the exact `path:line`, a trigger,
the evidence level and a suggested fix.

- **Why deferred.** Items were below this pass's severity cut (Low). The mutation-testing gaps are deferred because
  mutation work was paused on request.
- **Suggested next five** (from NEXT-Steps "Suggested order"):
  1. **NS-L23**: add `passThroughEnv: ["JWT_SECRET","ENFORCE_AUTH"]` to the `dev` task in `turbo.json`. This stops the dev sign-outs.
  2. **NS-L5**: look up the user in `authenticate`. Tokens for users that no longer exist can currently still write the cart and **place orders**.
  3. **NS-L4**: JWT verify options `algorithms: ["HS256"]` and `requiredClaims: ["exp"]`. Tokens with no `exp`, and HS512 tokens, are accepted today.
  4. **NS-L13 / L22 / L14**: render mutation and query errors on the cart, detail and browse pages. They are silent today.
  5. **NS-L24**: make the turbo `test` task depend on `^build`, so a cached PASS can't hide a change to the shared schemas.
- **Mutation gaps.** 8 real survivors remain from the round-2 run (NS-M2…M7): the merge path, cents rounding,
  sort order, the min==max boundary, `.min(1)` on the favorites personaId, and M7's message format.
  - Evidence: `docs/evidence/mutation-round2.txt` (34 mutations: 24 killed, 10 survived, 1 equivalent). NS-M1 has since been closed.
- **By design:**
  - `ENFORCE_AUTH` flag kept (a user decision). Either make "off" work or remove the flag.
  - Quantity cap is **99**; the constant is private in `shared/schemas/cart.ts`.
  - The L10 "no `return reply` after 401" is harmless on Fastify 5.8.4.
- **Not touched:** the README (still accurate for commands and ports); `main` on the fork; the `.lore/` and `eci.yml` repo metadata.

---

## 4. Invariants the app now holds (checked by tests and the smoke runs)
1. Cart, favorites, checkout and `/auth/me` act only as the JWT user. Cross-user PUT and DELETE → **404** (C2, NS-M1).
2. Unauthenticated protected requests → **401**, never 500. This holds in the default config; `ENFORCE_AUTH=false` is the exception.
3. `minPrice <= price <= maxPrice`, inclusive. All four sorts do what their names say.
4. Cart total = Σ price × qty, rounded to cents; qty is an integer from 1 to 99.
5. Checkout snapshots the cart into an order, then empties the cart. A second checkout → 400 "Cart is empty".
6. Login and register both return `AuthResponse` (`user` = `{id, username, email}`).
7. Browser state follows server state:
   - Logout and 401 clear the token and the query cache.
   - The badge and cart pages refresh on every cart mutation.
8. The browser can call every method the client uses. CORS allows GET, POST, PUT and DELETE, and bodyless requests send no JSON content-type.

---

## 5. How to run and continue

### Prerequisites
- **Node 22** (validated on v22.9.0).
- **pnpm 9.15** on PATH; turbo needs the binary.
  - On the original machine `corepack enable` failed with a corepack 0.29.3 signing-key error.
  - Use `npm i -g pnpm@9.15.0`, or `npm i -g corepack@latest && corepack enable` (NS-L31).
- **First E2E run only:** `pnpm exec playwright install chromium`.
  - Set `PW_CHROMIUM_PATH` to reuse an existing Chromium binary instead.

### Commands
```bash
pnpm install --frozen-lockfile
pnpm build                     # vite build rewrites apps/web/src/routeTree.gen.ts line endings; `git checkout -- …` it
pnpm typecheck                 # add --force after changing packages/shared (see gotchas)
pnpm exec turbo test --force   # api + web; `pnpm test` works but can replay a stale cache
pnpm dev                       # API :3001 + web :5173 (set JWT_SECRET via NS-L23 first, or expect sign-outs on save)

pnpm smoke:api                 # needs a build; spawns the API twice on :3001 → .smoke-output/api-smoke.txt
# E2E needs the built API running (cd apps/api && node dist/index.js) and the web on :5173 (pnpm --filter @acme/web dev)
pnpm smoke:e2e A               # 14 checks, then stop and restart the API (new per-boot secret)
pnpm smoke:e2e B               # E3: the UI drops the session after the restart
pnpm smoke:explore             # 28 exploratory checks; records 4xx/5xx and console errors
node docs/evidence/probes/e5.mjs   # any error.md reproduction (needs a build)
```

### Where things are
| Path | What |
|---|---|
| `apps/api/src/app.ts` | `buildApp()`: CORS, JWT (secret + expiry), routes. `index.ts` only listens. |
| `apps/api/test/` | 8 suites; `helpers.ts` (`freshApp`, `registerUser`, `bearer`) |
| `apps/web/src/test/renderApp.tsx` | Web harness: `renderApp(path)`, `stubApi()`, `resetApp()`, fixtures |
| `apps/web/src/test/*.test.tsx` | UI suites: browse, favorites, personaDetail, cartUi, session, harness |
| `scripts/` | Smoke and E2E runners (`pnpm smoke:*`) |
| `docs/evidence/` | Smoke transcripts, mutation log, E2E results, screenshots, `probes/` |
| `error.md` | E1–E20: side effects of our fixes (CAUSED / UNMASKED / AMPLIFIED / INCOMPLETE) and why they happened |
| `NEXT-Steps.md` | Everything open, ranked |

### Gotchas
- **`routeTree.gen.ts` rewrites itself.** `vite build` and `vite dev` rewrite its line endings. Restore it before committing.
- **The turbo `test` cache ignores `packages/shared`.** Use `--force` after schema changes (NS-L24).
- **API test files are not typechecked**, because `apps/api/tsconfig.json` includes `src` only (NS-L25).
- **The web `test` script has `--passWithNoTests`**, so deleting every test would still pass (NS-L28).
- **Tests alias `@acme/shared` to its source, while `dev` and `start` use `dist`.** Rebuild shared before `pnpm dev`, or the API can crash at boot (NS-L30).
- **`.smoke-output/` holds real (short-lived) JWTs.** It is gitignored; keep it that way.
- **Git on Windows warns "LF will be replaced by CRLF"** on most files. This is expected; there is no `.gitattributes`.

---

## 6. How we got here (process context)
1. **Review.**
   - The session started as a PR review, but no PR existed on the fork, so it pivoted to "find the planted bugs".
   - Five parallel reviewers each covered one angle (leaks, security, concurrency/state, quality, edge cases), plus a build/test agent.
   - Findings were deduplicated and marked ✅ verified / 📖 code-confirmed / ❓ guessed.
2. **Round 1.**
   - Only ✅-verified Critical/High/Medium findings were fixed.
   - Four groups ran in parallel git worktrees, each owning separate files, test-first.
   - They were merged one at a time, with build, typecheck and test after each merge.
3. **Round 2.**
   - A fresh re-review found regressions our own fixes caused. E1 (DELETE 400) and E2 (register race) were the serious ones.
   - Those were logged in `error.md` with the mechanism for each.
   - Mutation testing measured how strong the tests were.
4. **Round 3.**
   - E1 and E2 were fixed test-first.
   - A web component harness was added.
   - The remaining non-low web bugs were fixed in four more parallel groups (W1–W4).
5. **Validation.** Playwright smoke and exploratory runs in real Chromium, then NS-M1, portability cleanup and this wrap-up.

**Integrity note.** The upstream `eci-global/interview-built-by-a-clanker` has an `answer-key` branch and other
candidates' PRs. **Neither was consulted.** Every finding comes from this code and its behaviour.

## 7. Lessons worth carrying forward (details in `error.md` → Patterns)
- **Crash masking.** C1 (every route 500) and H1 (DELETE blocked by CORS) hid everything behind them. Fixing them exposed E1, E13, E14 and E15. After removing a blocker, re-test the whole path *as the real client sends it*.
- **Sync → async breaks atomicity.** One `await` added for security (scrypt) created a race (E2).
- **Server hardening needs client work.** Expiry, the cap and new error shapes are new states the UI must handle (E3, E11, E12).
- **Test the sibling path.** The C2 DELETE fix was tested, but the identical PUT guard was not, until mutation testing caught it (NS-M1).
