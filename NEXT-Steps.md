# NEXT-Steps.md: work we are knowingly skipping

_Last validated: 2026-09-23T18:16:02Z against 026f1c2 — 43 open, 0 resolved, 5 added._

This file tracks everything we have found and **deliberately not fixed yet**, so nothing is lost when we stop.
Companion files:
- `error.md` logs issues *created or exposed by* our fixes (why they happened).
- This file logs what is still *open* and *why we deferred it*.

Branch: `fix/review-findings`, HEAD `026f1c2`. Stopping point for this pass: all Critical/High/Medium findings with
evidence are fixed (C1–C3, H1–H9, M1–M9, E1, E2, E3, E13, E14, E15/L5, E16), including the web merges W1–W4.
Next comes a Playwright smoke run of the app.

**Format:** each item gives what's wrong, where, how to trigger it, evidence, why it was skipped, and a suggested next step.
**Evidence:** ✅ verified by running it · 📖 confirmed by reading code · ❓ traced, not reproduced.
**Status:** `STILL OPEN`, or `RESOLVED (by <commit>)` with a pointer to the proof.
**Skip reasons:**
- `LOW`: below this pass's severity cut.
- `MUTATION-PAUSED`: test gap; mutation work paused by user request.
- `BY-DESIGN`: accepted decision; revisit only if the decision changes.
- `OUT-OF-SCOPE`: noticed while fixing something else, and owned by a file the fixer didn't own.
- `UNREACHABLE`: a real defect that no client can trigger today.

**How the 2026-09-23 validation was done** (no ports bound; scripts are in `scratchpad/nextsteps/`):
- `api-checks.mjs`, `api-checks2.mjs` and `enforce-off.mjs` call `app.inject()` on `apps/api/dist/app.js`.
  `dist` is current: no API source changed after `8f2728e`, and `dist/routes/auth.js:31-32` already has the E2 hash-before-check order.
- `web/ns.test.tsx` is a throwaway vitest file that uses the real route tree through `apps/web/src/test/renderApp.tsx`
  with a stubbed fetch. 16/16 pass: 15 assert that a defect is still there, and 1 re-checks the tier filter.
- Exploratory Playwright run in real Chromium against 026f1c2: `scratchpad/pw-explore.json`, `scratchpad/ex-*.png`.
- The `turbo-*.json` files come from `turbo run dev|test|lint --dry=json` (turbo 2.8.20).
- Name clash: **round-1 L5** (a stale `/auth/me` 401 deletes a fresh token, E15) is fixed in `ad27cf5`, and
  `apps/web/src/test/session.test.tsx:166` guards it. **NS-L5** below (N11, ghost-user tokens) is a different defect and is still open.

---

## Suggested order (next up)
Ranked by value ÷ effort.

1. **NS-M1**: one API test. It guards the sibling of the C2 Critical fix. If that fix regresses, Bob can change the quantity on Alice's cart line, and no test would notice.
2. **NS-L23**: one `passThroughEnv` line in `turbo.json`. Since W2, every 401 ends the session, so under `pnpm dev` each API save now rotates the secret *and signs the developer out*. The Playwright smoke run will hit this too.
3. **NS-L5**: one user lookup in `authenticate`. A token for a user who no longer exists can still write the cart and favorites and **place orders (201)**, verified. The same fix also closes the `/auth/me` 404 path in NS-L33.
4. **NS-L4**: two verify options in `app.ts:27`. A token with no `exp` and an HS512 token are both accepted today (verified). This finishes the C3 hardening.
5. **NS-L13 (+ NS-L22, NS-L14)**: the cart, detail and browse pages drop every error. "+" at 99 and Add to Cart at the cap fail silently (verified). Rendering `mutation.error` / `query.error` fixes three items at once.
6. **NS-L24**: `test.dependsOn: ["^build"]` in `turbo.json`. The dry run shows the test task has no dependency on `shared`, so a cached PASS can hide a schema regression. One line, and it keeps CI honest.
7. **NS-L17 + NS-L36**: two one-line changes to query options. `enabled: !!user` stops the signed-out favorites 401s. A retry predicate that skips 4xx removes the second 401 and makes "Persona not found" show about 1.4 s sooner. Both verified in Chromium.
8. **NS-L15**: `/?maxPrice=0` is silently ignored (verified). The fix is two lines, but both places must change in the same commit (W3's warning).

---

## 1. Mutation-test gaps (skip reason: MUTATION-PAUSED)
Source: round-2 mutation run at `c2f0c62`, 34 mutations: **24 killed, 10 survived**. One survivor, `g1`
(`clearForUser` moved to just before the items are built), is equivalent, because the entries are already snapshotted.
That leaves **9 real gaps**: `e, u, v, w, z1, z2, z3, z5, z6`. All 9 appear below. `w+z1` share NS-M2 and `z5+z6` share NS-M7.
Full log: `scratchpad/mutation-r2-results.txt` (`grep -c "=> KILLED"` → 24, `"=> SURVIVED"` → 10).
Each row is a production change that **every test still passes with**, which means no test protects that behavior.
Re-validated at 026f1c2: none of the missing tests has been added. The only API test added since c2f0c62 is
`register-race.test.ts`, and the web tests target W1–W4. The Evidence column shows what `dist` does today,
which is what the missing test would assert.

| ID | Mutant(s) | Surviving mutation | Location | Missing test (suggested) | Sev | Evidence | Status |
|---|---|---|---|---|---|---|---|
| NS-M1 | `e` | Remove the PUT ownership check (the sibling of the C2 fix) | `apps/api/src/routes/cart.ts:77-80` (guard `item.userId !== userId` at `:78`). The only PUT test is the quantity-cap test at `apps/api/test/cart.test.ts:127` | Bob sends `PUT /cart/<alice item> {quantity:9}` → 404, and Alice's line is still `quantity:3` | **Medium** | ✅ current behavior: 404 `{"error":"Cart item not found"}`, Alice qty stays 3. No test asserts it | STILL OPEN |
| NS-M2 | `w`, `z1` | Cart merge `+=` → `=`, or reject every merge | `apps/api/src/db.ts:420-424` (`+=` at `:421`), `apps/api/src/routes/cart.ts:52-62`. The only merge test covers the rejection path (`cart.test.ts:114`) | Add p-001 ×2, then ×2 → one line with qty 4, total 199.96. Also merging to exactly 99 (60 + 39) → 200 | Low | ✅ 2+2 → 1 line, qty 4, total 199.96 | STILL OPEN |
| NS-M3 | `u` | Drop cents rounding of the cart total | `apps/api/src/routes/cart.ts:25`. **Also** `apps/api/src/routes/checkout.ts:44`: the checkout test (`checkout.test.ts:75-89`) uses p-001×2 + p-002×3 = 369.95, which is exact in floating point, so dropping the rounding there survives too | **Corrected:** the old suggestion (3 × 49.99) would NOT kill this mutation, because `49.99*3 === 149.97` exactly in JS. Use **p-002 × 3** instead: raw `269.96999999999997`, expected `total === 269.97` (cart and checkout). Other failing-without-rounding inputs: p-001×5, p-001+p-005 | Low | ✅ `m3-find.mjs` and inject | STILL OPEN |
| NS-M4 | `v` | Reverse the `rating-desc` comparator | `apps/api/src/db.ts:380-382` (comparator `:381`); price-desc `:378`, name-asc `:384`. Only price-asc is asserted (`personas.test.ts:91-99`) | Assert the order for rating-desc (`p-002,p-007` 4.9 first, then `p-001` 4.8), price-desc (`p-011` 99.99 first) and name-asc (`p-009` "A11y Alex" first) | Low | ✅ orders observed | STILL OPEN |
| NS-M5 | `z2` | min>max check changed to `>=` | `apps/api/src/routes/personas.ts:16` | `?minPrice=49.99&maxPrice=49.99` → 200 with `[p-001, p-015]` | Low | ✅ 200 `[p-001,p-015]` | STILL OPEN |
| NS-M6 | `z3` | Drop `.min(1)` from `addFavoriteSchema` | `packages/shared/src/schemas/favorite.ts:4` | `POST /favorites {personaId:""}` → 400 with `fieldErrors.personaId`. The existing "empty object" test sends `{}`, not `""` | Low | ✅ 400 `fieldErrors.personaId` | STILL OPEN |
| NS-M7 | `z5`, `z6` | Web `errorMessage` ignores `formErrors` or drops the field prefix | `apps/web/src/lib/api.ts:36-59` (formErrors `:46-48`, prefix `:53`); weak assertion at `apps/web/src/lib/api.test.ts:58` | `{formErrors:["Required"],fieldErrors:{}}` → message `"Required"`. Tighten `api.test.ts:58` from `toContain` to `toBe("username: String must…")` | Low | 📖 (the only fixture has `formErrors: []`, `api.test.ts:44`) | STILL OPEN |

**Tests that guard nothing.** These passed *before* their fix, so they prove no bug fix:
- favorites "rejects an empty object with 400"
- cart "returns 404 for a nonexistent cart item id"
- personas "returns all 15 personas with no params"
- web "falls back to a status message for a non-JSON body"
- web "sends the stored token…"
- W4 "at quantity 2, '-' sends PUT {quantity: 1}"
- E2 "leaves the winner able to log in"
- W2 "keeps the session when POST /auth/login returns 401 (wrong password) [regression guard]" (`session.test.tsx:141`, labelled as such by its author)

They are kept as regression guards. They are not evidence.

**Status-only assertions to strengthen:**
- "rejects POST quantity 100" (`cart.test.ts:101`) doesn't check the cart is unchanged.
- favorites "404 for unknown persona" (`favorites.test.ts:72`) doesn't check the list is unchanged.
- "unknown sort / specialty / non-string personaId" (`personas.test.ts:75,80`, `favorites.test.ts:37`) don't check the error body.
- The CORS test (`cors.test.ts:9`) never checks `access-control-allow-origin`.

---

## 2. Low findings still open (skip reason: LOW unless noted)

### Security / auth
| ID | Issue | Location | Trigger | Evidence | Next step | Status |
|---|---|---|---|---|---|---|
| NS-L1 (E6) | Login timing reveals whether an email is registered | `apps/api/src/routes/auth.ts:71` (`!user \|\| !(await verifyPassword…)` short-circuits) | Time a login for a known email vs an unknown one | ✅ re-run: 74.3 ms known vs 2.0 ms unknown (mean of 5) | Run a dummy scrypt when the user doesn't exist | STILL OPEN |
| NS-L2 (E7) | No rate limit on the scrypt endpoints: floods block the 4-thread pool | `apps/api/src/routes/auth.ts:32` (register), `:62` (login); `apps/api/src/app.ts:14-33` registers no limiter | 64 concurrent logins take 1.29 s | ✅ (round 2; not re-run) | `@fastify/rate-limit` on `/auth/*` | STILL OPEN |
| NS-L3 (E8) | A malformed stored hash verifies **any** password (0-byte compare) | `apps/api/src/routes/auth.ts:23-29` (key length taken from the stored value at `:26-27`) | Stored hash `scrypt$zz$zz` | ✅ re-run end to end: user inserted via `db.users.create`, `POST /auth/login` with any password → 200. UNREACHABLE | Require a 64-byte key and a 16-byte salt | STILL OPEN |
| NS-L4 (E9) | JWT: `exp` not required, algorithm not pinned (HS512 accepted), weak `JWT_SECRET` accepted | `apps/api/src/app.ts:20-27` (verify options missing at `:27`) | Hand-signed HS256 token with no `exp` → `/auth/me` 200; HS512 token → 200 | ✅ re-run (`api-checks.mjs`) | `verify:{algorithms:["HS256"],requiredClaims:["exp"]}`, plus a minimum secret length | STILL OPEN |
| NS-L5 (N11) | A token for a user who no longer exists can still write the cart and favorites and **place an order** | `apps/api/src/middleware/auth.ts:14-18` (no user lookup); consumed by `routes/cart.ts:29`, `routes/favorites.ts:7`, `routes/checkout.ts:7`. Only `/auth/me` checks (`routes/auth.ts:89-92`) | Token signed for `user-ghost`: `POST /cart` 200, `POST /favorites` 200, `POST /checkout` **201**, `GET /auth/me` 404 | ✅ was ❓ (in-process `app.jwt.sign`, the same as a fixed `JWT_SECRET` plus restart) | Check the user exists in `authenticate`, and 401 if not | STILL OPEN |
| NS-L6 (L1) | Email match is case-sensitive, so duplicate accounts are possible | `apps/api/src/db.ts:397-398` (`u.email === email`); `packages/shared/src/schemas/auth.ts:5,12` | `Carol@X.com` and `carol@x.com` both register | ✅ re-run: 201, 201 | Normalize emails (trim + lowercase) at the schema | STILL OPEN |
| NS-L7 (L11) | 409 on register reveals which emails exist. In-memory Maps are unbounded | `apps/api/src/routes/auth.ts:44-45`; `apps/api/src/db.ts:15-18` | Re-register a known email; loop register | ✅ 409 for a known email / 📖 unbounded Maps | Accept this or change the register UX. Cap or evict the Maps | STILL OPEN |
| NS-L8 (N14) | Password edge cases: unpaired Unicode surrogates collide, no NFC normalization, a 3-space username is accepted | `apps/api/src/routes/auth.ts:17-20,23-28` (raw string to scrypt); `packages/shared/src/schemas/auth.ts:4,6` | Register `username:"   "` with `pass\ud800word`, then log in with `pass\udc00word` | ✅ re-run: register 201, cross-surrogate login 200 | `.normalize("NFC")`, reject unpaired surrogates, `.trim()` the username | STILL OPEN |
| NS-L9 (E10/L2) | `ENFORCE_AUTH=false` makes every protected route 500 and leak internals | `apps/api/src/middleware/auth.ts:4,10-12`; handlers destructure `request.user` (e.g. `routes/cart.ts:32`) | `ENFORCE_AUTH=false GET /cart`, with or without a valid token | ✅ re-run: 500 `Cannot destructure property 'id' of 'request.user' as it is null.` | BY-DESIGN (user chose to keep the flag). Either make "off" work or remove the flag. Add `setErrorHandler` for generic 500s | STILL OPEN |
| NS-L32 **(new)** | A 403 is not treated as the end of a session. Only 401 calls the unauthorized handler | `apps/web/src/lib/api.ts:82` | Authenticated request gets 403 → token kept, user still shown | ✅ (`ns.test.tsx`, stubbed 403 on `/cart`). UNREACHABLE: the API never sends 403 (only a comment mentions it, `routes/cart.ts:92`) | Decide what 403 means. If the API ever uses it for revoked or disabled accounts, route it to `endSession`. Otherwise add a comment that only 401 ends the session | STILL OPEN (source: round-3 W2 note) |
| NS-L33 **(new)** | A non-401 failure of `/auth/me` (5xx, network error, 404) leaves a token and no user: the UI shows signed-out, but the token is kept and sent as a Bearer on every later request, and every reload repeats it | `apps/web/src/lib/auth.tsx:58-67` (`.catch(() => {})` at `:64`) | Stored token + `/auth/me` returns 500, throws `TypeError`, or 404 (the NS-L5 ghost user) | ✅ (`ns.test.tsx`: all three modes keep `auth_token`, show "Sign in", and send the Bearer on `/personas`) | 404 → `endSession()`. 5xx/network → keep the token but show a "can't reach server, retry" state instead of a silent signed-out UI | STILL OPEN (source: round-3 W2 note) |
| NS-L35 **(new)** | The 401 handler is a single module-level slot: a second `AuthProvider` overwrites it, and unmounting either one sets it to `null`, after which 401s no longer end any session | `apps/web/src/lib/api.ts:21-26`; registered in `apps/web/src/lib/auth.tsx:43-48` | Mount two `AuthProvider`s (a test harness, a future embedded widget), then unmount one | ✅ was 📖. error.md **E20** part 3 ("E20b"): with two providers and the second unmounted, `GET /cart -> 401` leaves the stale token in place. UNREACHABLE in the app today: there is one provider, at `apps/web/src/main.tsx:25` | Keep a `Set` of handlers (subscribe/unsubscribe), or throw if a second provider registers | STILL OPEN (source: round-3 W2 note) |

### API contract / validation
| ID | Issue | Location | Trigger | Evidence | Next step | Status |
|---|---|---|---|---|---|---|
| NS-L10 (E5/N4) | `z.coerce.number()` turns an empty or whitespace `?maxPrice=` into 0, which returns `[]`. Empty enum values → 400. Hex and `Infinity` accepted | `packages/shared/src/schemas/persona.ts:47-48`; used at `apps/api/src/routes/personas.ts:7` | `?maxPrice=` and `?maxPrice=%20` → 0 personas; `?specialty=` / `?sort=` → 400; `?minPrice=0x10` → 200 (read as 16); `?minPrice=Infinity` → 200 `[]` | ✅ re-run | Preprocess `""` and whitespace to undefined. Require finite decimal values | STILL OPEN |
| NS-L11 | `addToCartSchema.personaId` has no `.min(1)` (`""` → 404 instead of 400) | `packages/shared/src/schemas/cart.ts:17` | `POST /cart {"personaId":""}` → 404 `Persona not found` | ✅ was 📖 | Add `.min(1)` | STILL OPEN |
| NS-L12 (N15) | Checkout skips items whose persona is missing, which can produce a `201` order with no items and total 0 | `apps/api/src/routes/checkout.ts:27-28` (`if (!persona) continue`) | Add p-003, delete it from the `personas` Map, then check out | ✅ was ❓: 201, `items=0`, `total=0` (`api-checks2.mjs`). UNREACHABLE: no route removes personas | Return 409 when any line can't be resolved | STILL OPEN |

### Web UX
| ID | Issue | Location | Trigger | Evidence | Next step | Status |
|---|---|---|---|---|---|---|
| NS-L13 (E11/N12) | The 99-quantity cap is silent: "+" is never disabled, and Add to Cart at 99 shows nothing | `apps/web/src/components/CartItem.tsx:50-52` ("+" has no `disabled`); `apps/web/src/routes/cart.tsx:23-36` and `apps/web/src/routes/personas/$personaId.tsx:32-38` never render `mutation.error` | "+" at 99 → `PUT {quantity:100}` → 400, no message. Add to Cart on a 99 line → 400, no message | ✅ API and UI (UI was ❓; `ns.test.tsx`) | Disable "+" at 99. Render mutation errors | STILL OPEN |
| NS-L14 (E12) | The M7 message shows "Bad Request" for Fastify-generated errors instead of `message` | `apps/web/src/lib/api.ts:90` (reads `body.error` only) | Any Fastify-native 400, e.g. an invalid JSON body → `{"error":"Bad Request","message":"Body is not valid JSON…"}` | ✅ API shape and `ApiError.message === "Bad Request"` (`ns.test.tsx`) | Prefer `body.message` when `error` is a generic HTTP phrase | STILL OPEN |
| NS-L15 (L6) | The web drops a price of 0 (`/?maxPrice=0` shows all) | `apps/web/src/routes/index.tsx:23-24` (`validateSearch` truthy check) **and** `:38-39` (query-string builder truthy check) | `/?maxPrice=0` → request is `GET /personas` with no `maxPrice` | ✅ was 📖 (`ns.test.tsx`) | Change **both** places in one commit. W3's warning: since H6, the query key is the `search` object (`:43`) but the request comes from the builder. Fixing only `validateSearch` gives a key with `maxPrice:0` and a request without it | STILL OPEN |
| NS-L16 (L3) | StarRating shares `id="half"`, so every partial star uses the first card's fill | `apps/web/src/components/StarRating.tsx:17` (`url(#half)`) and `:23` (`id="half"`) | Browse grid with two partial ratings → gradient ids `["half","half"]` | ✅ was 📖 (vitest). Chromium: the browse page has 15 `linearGradient`s, 14 of them with duplicate ids (`pw-explore.json`, obs "stars") | `useId()` for the gradient id | STILL OPEN |
| NS-L17 (L4) | The detail page's favorites query isn't gated on `user`, so signed-out visits make 401 calls | `apps/web/src/routes/personas/$personaId.tsx:24-28` (no `enabled`) | Signed-out visit to `/personas/p-001` → 2 `GET /favorites` (query + 1 retry, see NS-L36), both 401 | ✅ was 📖 (vitest). Chromium: signed-out `/personas/p-002` → `GET /favorites -> 401` plus a console error (`pw-explore.json` `net` / `consoleErrs`) | `enabled: !!user` | STILL OPEN |
| NS-L18 (L7) | Two quick "+" clicks send the same absolute quantity twice (lost update). "−" isn't disabled while its update is in flight | `apps/web/src/components/CartItem.tsx:41-42,51`; `apps/web/src/routes/cart.tsx:93-95` | Double-click "+" at qty 3 → `PUT 4`, `PUT 4` | ✅ was ❓ (lost update) / 📖 (in-flight "−") | Disable while pending, or send deltas | STILL OPEN |
| NS-L19 (L8) | The SearchBar sync effect can drop a character typed during navigation | `apps/web/src/components/SearchBar.tsx:11-13` | Type → pause → type | ❓ | Don't overwrite local state while the input is focused | STILL OPEN |
| NS-L20 | The badge key `["cart","count"]` means each cart mutation now fires two `GET /cart` requests | `apps/web/src/routes/__root.tsx:15-20` (key at `:17`) | One "+" on /cart → 2 extra `GET /cart` | ✅ was 📖. This is error.md **E19**, introduced by W4 (`8baa8f5`, merged `75dadf4`); the same double fetch happens on /checkout | Have the badge read the `["cart"]` query (or `select` from it) | STILL OPEN |
| NS-L21 | The heart button has no accessible name (tests find it by position) | `apps/web/src/routes/personas/$personaId.tsx:174-178` | Screen reader. Button names on the detail page: `["Sign out","Add to Cart",""]` | ✅ was 📖 | `aria-label` / `aria-pressed` | STILL OPEN |
| NS-L22 (N3 web) | 400s from `/personas` render as "No personas found" with no error text | `apps/web/src/routes/index.tsx:42` (`error` never read), `:107-111` | `/?sort=bogus` (API 400) | ✅ was ❓ | Render `query.error` | STILL OPEN |
| NS-L34 **(new)** | `queryClient.clear()` on login, logout and 401 also drops public caches (personas list, persona details), so they refetch although they are inside `staleTime` | `apps/web/src/lib/auth.tsx:34` (`endSession`), `:76` (`login`) | Browse `/`, then sign in within 60 s → `GET /personas` fires again | ✅ (`ns.test.tsx`: 2 `GET /personas` across one login). This is error.md **E20** parts 1–2. After logout nothing refetches right away; the cost comes on the next mount | Put user-scoped keys under one prefix (e.g. `["me", …]`) and `removeQueries` that prefix. Keep `clear()` until then: a denylist can miss a new private key, and that would bring back the E14 leak | STILL OPEN (source: round-3 W2 note). Performance only |
| NS-L36 **(new)** | Queries retry 4xx responses the same way they retry network errors. An unknown persona fetches twice, and "Persona not found" appears only after about 1.4 s. The retry also doubles the signed-out favorites 401 (NS-L17) | `apps/web/src/lib/queryClient.ts:7` (`retry: 1`) | Visit `/personas/does-not-exist` → `GET /personas/does-not-exist -> 404` twice | ✅ Playwright (Chromium): `pw-explore.json` `net` shows the 404 twice; the ~1.4 s delay was measured by the coordinator's run | `retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1` (`ApiError` is exported from `apps/web/src/lib/api.ts:115`) | STILL OPEN (source: exploratory Playwright run) |

### Build / test / tooling
| ID | Issue | Location | Evidence | Next step | Status |
|---|---|---|---|---|---|
| NS-L23 (E4) | Turbo strict env drops `JWT_SECRET` and `ENFORCE_AUTH` under `pnpm dev`, so the secret rotates on every save. **Since W2 this also signs the developer out on every API save** | `turbo.json:12-15` | ✅ re-run dry: `envMode: "strict"`, `@acme/api#dev` passthrough `null` | `passThroughEnv: ["JWT_SECRET","ENFORCE_AUTH"]` on `dev` | STILL OPEN |
| NS-L24 (E18) | Turbo's `test` cache ignores changes in `packages/shared` | `turbo.json:29-31` | ✅ re-run dry: `@acme/api#test` and `@acme/web#test` have `dependencies: []` and no shared inputs | `test.dependsOn: ["^build"]` or a transit task | STILL OPEN |
| NS-L25 (E18) | API test files are never typechecked | `apps/api/tsconfig.json:7` (`"include": ["src"]`) | ✅ | Add a `tsconfig.test.json` and typecheck it | STILL OPEN |
| NS-L26 (E17) | `apps/api/vitest.config.ts` forces `ENFORCE_AUTH=true` for all suites. Its comment "Pre-fix, auth is opt-in" is stale | `apps/api/vitest.config.ts:14-15` | ✅ | Drop the forced env now that C1 defaults on | STILL OPEN |
| NS-L27 (E17) | `cart.test.ts` and `checkout.test.ts` never call `app.close()` | `apps/api/test/cart.test.ts:1` and `apps/api/test/checkout.test.ts` (no `afterEach`/`close` anywhere in either file) | 📖 (grep) | Add `afterEach(close)` | STILL OPEN |
| NS-L28 | The web `test` script uses `--passWithNoTests`, so deleting every test still passes | `apps/web/package.json:11` | ✅ was 📖 (dry run: `@acme/web#test` command is `vitest run --passWithNoTests`) | Remove the flag now that tests exist | STILL OPEN |
| NS-L29 (L9) | `pnpm lint` does nothing (no lint script or config anywhere) | root `package.json:7`; `turbo.json:16-20` | ✅ re-run dry: every `#lint` task is `<NONEXISTENT>` (it still builds `shared` first) | Add ESLint, or drop the script | STILL OPEN |
| NS-L30 (E18) | `pnpm dev` against a stale shared `dist` crashes the API at boot (`addFavoriteSchema` missing) | `turbo.json:12-15` (`dev` has no `dependsOn`) | ✅ pipeline gap (dry run: `@acme/api#dev` `dependencies: []`) / ❓ crash not reproduced | `dev.dependsOn: ["^build"]` | STILL OPEN |
| NS-L31 | `pnpm` isn't installed globally on this machine. We use the corepack shim at `scratchpad/bin/pnpm.cmd` | environment | ✅ re-run: `where pnpm` → not found | Install pnpm 9.15 (`corepack enable` failed on a signing-key bug) | STILL OPEN |

---

## 3. Deferred by design (skip reason: BY-DESIGN)
All re-checked at 026f1c2 and unchanged.
- **`ENFORCE_AUTH` flag kept, default on** (`apps/api/src/middleware/auth.ts:4`). User decision (round 1). Consequences are in NS-L9.
- **L10: the 401 path has no `return reply`** (`apps/api/src/middleware/auth.ts:17`). Verified harmless on Fastify 5.8.4, because the handler never runs. Revisit on a Fastify upgrade.
- **Quantity cap = 99** (`packages/shared/src/schemas/cart.ts:14`). An arbitrary bound chosen in the M5 fix. The constant is private, because exporting it needed a file the fixer didn't own. NS-L13 ("disable '+' at 99") will need it exported or duplicated.

## 4. Verified working in the browser (exploratory, 026f1c2)
Real Chromium run; evidence in `scratchpad/pw-explore.json` and `scratchpad/ex-01…09-*.png`. No need to re-test these:
- Signed out, `/cart`, `/favorites` and `/checkout` show sign-in prompts, and the persona detail page hides Add to Cart.
- An unknown route shows "Not Found". An unknown persona shows "Persona not found" (slowly; see NS-L36).
- Search (`zara` → 1 card), the no-results state with Clear filters (restores 15 cards and empties the box), and all 4 sorts work.
- Tier filter: **the Playwright probe marked "Tier=Enterprise shows only Enterprise" as failed**, and its only detail
  was the URL. Re-checked: `GET /personas?tier=Enterprise` returns exactly the 4 Enterprise personas, the probe's
  later sort checks under `?tier=Enterprise` listed only Enterprise names, and `ns.test.tsx` "PW-recheck"
  (click Enterprise → request `?tier=Enterprise`, non-Enterprise card gone) passes. The failure is treated as a
  probe timing artifact, not a defect.
- Back restores the previous filter state (`?tier=Enterprise&sort=rating-desc`).
- Register shows readable errors: "email: Invalid email" for a bad email, "Email already registered" for a duplicate.
- Login with a wrong password shows "Invalid email or password". A correct login lands on `/`.
- A 3-line cart plus one "+" totals $249.96, and the badge shows 4.
- Checkout rejects `a@b` with "email: Invalid email", then confirms at $249.96. Continue Shopping goes to `/`.
- The heart toggles on and off from the detail page, and favorites are empty after toggling off.

## 5. Process / housekeeping
- Nothing on `fix/review-findings` has been pushed. The fork is `bowser-webster/interview-built-by-a-clanker`.
- `error.md` and this file are untracked until committed.
- Worktrees under `.claude/worktrees/` (excluded via `.git/info/exclude`) can be removed after the merges.
- error.md cross-check (2026-09-23, against the final error.md with E1–E20): every entry is either FIXED
  (E1, E2 `8f2728e` · E3, E14, E15 `026f1c2` · E13 `898a2bd` · E16 `75dadf4`) or tracked here:
  E4→L23 · E5→L10 · E6→L1 · E7→L2 · E8→L3 · E9→L4 · E10→L9 · E11→L13 · E12→L14 · E17→L26/L27 ·
  E18→L24/L25/L30 · E19→L20 · E20→L34 (parts 1–2) and L35 (part 3).
  One sub-point has no item of its own: **E20 part 2, a 401 does not redirect to /login.** Each page renders its own
  sign-in prompt instead, and that was verified working in the browser (section 4). It is left as is. Open an item only if a redirect is wanted.
- `apps/api/dist` was current at validation time. Rebuild before re-running `scratchpad/nextsteps/*.mjs` if API or shared source changes.
