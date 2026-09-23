# error.md — issues created or exposed while fixing other issues

_Last run: 2026-09-23T13:15:24-05:00 — 18 of 18 entries reproduced against c2f0c62, 0 not reproduced (one E17 sub-claim not reproduced and corrected), 0 not runnable. Status re-checked at 026f1c2: E1 E2 E3 E13 E14 E15 E16 are fixed; E11 and E12 still reproduce. Two new entries, E19 and E20, are verified at 026f1c2._

A running log of side effects from fixes on branch `fix/review-findings`. The purpose is to look back
later and understand **why** fixing one thing produced a problem somewhere unrelated.

Each entry records which fix triggered it, the mechanism, and why our tests didn't catch it.

## How to read this

**Relation** — how the issue relates to the fix:
- **CAUSED**: the fix introduced new wrong behavior that did not exist before.
- **UNMASKED**: the bug already existed; the fix removed whatever was hiding it (a crash, an earlier
  failure, a blocked request). The fix is correct, but the bug is now reachable.
- **AMPLIFIED**: an existing bug became more frequent or more visible because of the fix.
- **INCOMPLETE**: the fix addressed the symptom we tested, but not the whole failure path.

**Evidence** — ✅ verified by running it, 📖 confirmed by reading code only, ❓ traced but not reproduced.

Commits referenced: harness `5bcddb1` · group B (C2 H3 M5) `96ea5da` · group D (M7 M8) `857fdb4` ·
group A (C1 C3 M2 H1 H4 M1) `1d4d3cf` · group C (H2 M3 M4) `45ea960` · round-1 merge tip `c2f0c62` ·
E1/E2 fix `8f2728e` · web test harness `a25326a` · W1 (H5 H8) `898a2bd` · W4 (M6/E16 M9) `75dadf4` ·
W3 (H6 H7) `42044a2` · W2 (H9 E3 L5) `026f1c2`.

**How the runs were done (2026-09-23).** Every entry was re-run. Unless an entry says otherwise, file:line
references are at `c2f0c62`.
- **API:** `apps/api/dist` and `packages/shared/dist` were built at 12:58, from c2f0c62 source (before `8f2728e`
  touched `auth.ts` at 13:01). Node ESM scripts `import { buildApp }` from dist and use `app.inject`. No port is bound.
- **UI:** the web source was extracted with `git archive` (at c2f0c62, and again at 026f1c2) into a scratch folder.
  It ran under vitest + jsdom using the repo's own `renderApp` harness (from `a25326a`). `fetch` was bridged
  into the real API through `app.inject`, so each run exercised real routes, the real AuthProvider, the real
  queryClient and the real API.
- **Scripts:** all under `scratchpad/errmd/`. That is `e1.mjs`–`e17b.mjs`, `e18boot.mjs` + `stale-hooks.mjs`,
  `turbo-env/`, and `web-c2f/ui.test.tsx` / `web-w2/ui.test.tsx`.
- **E2 still reproduces against dist on purpose.** dist was built at c2f0c62, before `8f2728e`. That is not a
  contradiction: the fix is verified separately against current source.

---

## Summary

| ID | Triggered by | Relation | Severity | Evidence | Status | One line |
|---|---|---|---|---|---|---|
| E1 | H1 CORS | UNMASKED / INCOMPLETE | High | ✅ API + web client | FIXED `8f2728e` | Browser DELETEs passed CORS, then failed with 400 on the body parser |
| E2 | H4 scrypt | CAUSED | Medium | ✅ 3/3 runs | FIXED `8f2728e` | `await` between the duplicate check and the insert → two accounts, one email |
| E3 | C3 expiry + per-boot secret | CAUSED | Medium | ✅ API + UI | FIXED `026f1c2` (W2) | Web had no 401 handling → looked logged in, every page showed "empty" |
| E4 | C3 per-boot secret | AMPLIFIED by config | Low | ✅ dry run + runtime replica | open | Turbo strict env drops `JWT_SECRET`, so the secret rotates on every dev save |
| E5 | M3 query validation | CAUSED | Low | ✅ | open | `z.coerce.number("")` → 0, so `?maxPrice=` returns nothing |
| E6 | H4 scrypt | CAUSED | Low | ✅ 69.35 ms vs 0.24 ms | open | Login timing reveals whether an email is registered |
| E7 | H4 scrypt | CAUSED | Low | ✅ victim login 69 ms → 1124 ms | open | Expensive hash + no rate limit → auth thread-pool exhaustion |
| E8 | H4 scrypt | CAUSED (latent) | Low | ✅ | open | A malformed stored hash verifies any password |
| E9 | C3 hardening | INCOMPLETE | Low | ✅ | open | `exp` not required, algorithm not pinned, weak `JWT_SECRET` accepted |
| E10 | C1 (keep flag, default on) | CAUSED by design choice | Low | ✅ | open | `ENFORCE_AUTH=false` 500s every protected route |
| E11 | M5 quantity cap | CAUSED | Low | ✅ API + UI | open (still at 026f1c2) | UI lets you hit the cap and shows nothing |
| E12 | M7 error formatting | INCOMPLETE | Low | ✅ web client | open (still at 026f1c2) | Fastify-native errors display "Bad Request" |
| E13 | C1 auth enforced | UNMASKED | High | ✅ UI | FIXED `898a2bd` (W1) | `["favorites"]` shape collision crashed the detail page |
| E14 | C1 auth enforced | UNMASKED / AMPLIFIED | High | ✅ UI | FIXED `026f1c2` (W2) | Logout kept the token, so a reload restored the session; the next user saw the previous user's cart |
| E15 | C1 auth enforced | UNMASKED | Low | ✅ UI | FIXED `026f1c2` (W2) | Dead `/auth/me` 401 branch was live; a stale 401 deleted a fresh token |
| E16 | H3 cart cleared | AMPLIFIED | Medium | ✅ UI | FIXED `75dadf4` (W4) | Stale cart badge contradicted the server after every checkout |
| E17 | Test harness (phase 0) | CAUSED | Low | ✅ (1 sub-claim not reproduced) | open (stale comment) | Harness test asserted the M2 bug; stale config comment |
| E18 | Harness + fix agents | CAUSED (process) | Low | ✅ | open | Turbo test cache ignores shared; API test files never typechecked; stale dist crashes boot |
| E19 | W4 badge fix (M6/E16) | CAUSED | Low | ✅ UI | open | Each cart mutation on /cart and /checkout now fires two `GET /cart` |
| E20 | W2 session fix (H9/E3/L5) | CAUSED | Low | ✅ UI (logout-refetch part not reproduced) | open | `queryClient.clear()` also drops public caches; 401 handler is a single module-level slot |

---

## Entries

### E1. Browser DELETEs still fail after the CORS fix
- **Triggered by:** H1, adding `DELETE` to the CORS methods (`apps/api/src/app.ts:17`, commit `1d4d3cf`)
- **Relation:** UNMASKED + INCOMPLETE. Severity **High**. Evidence ✅.
- **Status:** FIXED in 8f2728e (test-first; RED quoted). `web/lib/api.ts` only sets Content-Type when there is a body.
  Test: `apps/web/src/lib/api.test.ts` "sends no Content-Type on a bodyless DELETE". The RED failure was "expected true to be false".
- **What happened:** the preflight passed, but the real request was rejected:
  `400 {"code":"FST_ERR_CTP_EMPTY_JSON_BODY","message":"Body cannot be empty when content-type is set to 'application/json'"}`.
  Remove-from-cart, remove-favorite and unfavorite were all still broken in the browser.
- **Mechanism:** `apps/web/src/lib/api.ts:52-55` set `Content-Type: application/json` on *every*
  request, including `api.delete` (`:92`), which has no body. Fastify 5 treats DELETE as a
  body-capable method and parses before any hook, so an empty JSON body is a 400.
  Before H1, the browser blocked the request at preflight, so this second failure was never reached.
- **Why tests missed it:**
  - `cors.test.ts` asserts only the preflight `Allow-Methods` header.
  - `cart.test.ts` injects DELETE *without* a content-type, which is not how the web client sends it.
  - The fix was verified at the layer where the symptom was reported (CORS), not end to end from the real client.
- **Verified:**
  - `node errmd/e1.mjs` (c2f0c62 dist):
    - `preflight 204 allow-methods: GET, POST, PUT, DELETE, OPTIONS`
    - `DELETE /cart/:id web-client headers -> 400 {...,"code":"FST_ERR_CTP_EMPTY_JSON_BODY","error":"Bad Request",...}`
    - `DELETE /favorites/:id web-client headers -> 400 ...`
    - `DELETE /cart/:id no content-type -> 200 {"items":[],"total":0}`
  - Through the real web client (`web-c2f/ui.test.tsx`, "E1/E12"): `DELETE /cart/cart-1 -> 400 | error.message: "Bad Request"`.
- **Run log:** 2026-09-23 12:59 — `node e1.mjs` → reproduced (400 with JSON content-type, 200 without).
  13:14 — same web test on the 026f1c2 source → `DELETE /cart/cart-1 -> 200 | error.message: "(resolved)"`. Fix confirmed.
- **Lesson:** when a fix removes a blocker (CORS, auth, a crash), re-test the *whole* request path
  exactly as the real client sends it. The next failure down the chain is often already waiting.

### E2. Two accounts can register with the same email
- **Triggered by:** H4, replacing the sync `simpleHash` with async `scrypt` (`apps/api/src/routes/auth.ts:40-52`, commit `1d4d3cf`)
- **Relation:** CAUSED. Severity **Medium**. Evidence ✅.
- **Status:** FIXED in 8f2728e (test-first; RED quoted). `api/routes/auth.ts` now hashes before the duplicate check,
  so no `await` sits between the check and the create. Test: `apps/api/test/register-race.test.ts`.
  The RED failure was "expected [ 201, 201 ] to deeply equal [ 201, 409 ]".
- **What happened:** two parallel `POST /auth/register` requests with the same email both returned **201**.
  `getByEmail` (`db.ts:397-399`, first match in insertion order) returns whichever user was inserted first,
  so the other user can never log in (401). *Correction:* which one loses is not fixed. It depends on which
  scrypt call finishes first (run 1: the 1st password → 401; run 2: the 2nd password → 401).
- **Mechanism:** `passwordHash: await hashPassword(password)` sat inside the `db.users.create({...})`
  argument (`auth.ts:47-52`), *after* the `getByEmail` duplicate check (`:40`). The `await` yields to the event loop while scrypt
  runs in the libuv pool, so a second request passes the same check before the first one inserts.
  With the old synchronous hash, check-then-insert ran without yielding, so it was effectively atomic.
- **Why tests missed it:** H4 tests asserted hash correctness (collision rejected, per-user salt) and
  never sent concurrent registrations. The race only exists in the gap between two awaits.
- **Verified:** `node errmd/e2.mjs`, 3 runs against c2f0c62 dist. Every run showed
  `parallel register -> 201 201` (two different `user-<uuid>` ids), one password → 401 and the other → 200,
  and then `sequential 3rd register -> 409`.
- **Run log:** 2026-09-23 13:00 — `node e2.mjs` ×3 (c2f0c62 dist) → reproduced 3/3.
  13:14 — `node --import tsx e2src.mjs` ×3 against **current source** (`apps/api/src/app.ts`, includes 8f2728e) → `parallel register -> 409 201` 3/3.
  Also ran `vitest run test/register-race.test.ts` → 2 passed. Fix confirmed. This dist still reproduces it because dist predates 8f2728e.
- **Lesson:** turning synchronous code async inside a check-then-act sequence silently breaks
  atomicity in Node. Re-check after the await, or hash before the check.

### E3. After a token expires or the API restarts, the web app looks logged in but nothing works
- **Triggered by:** C3, adding `expiresIn: "1h"` and a random per-boot secret (`apps/api/src/app.ts:20-27`, commit `1d4d3cf`)
- **Relation:** CAUSED. Severity **Medium**. Evidence ✅ (API and UI).
- **Status:** FIXED in 026f1c2 (W2, "merge: W2 (session) H9 E3 L5").
  - `api.ts` calls the handler registered with `setUnauthorizedHandler` on a 401 from any authenticated
    request except `/auth/login` and `/auth/register`.
  - AuthProvider's `endSession` then clears the token, the user and the whole query cache.
- **What happened (c2f0c62):** the header kept showing the username. /cart showed "Your cart is empty",
  /favorites showed "You haven't favorited any personas yet.", and Add to Cart failed silently.
  Only a full reload recovered.
- **Mechanism:** before C3, tokens never expired and the secret never changed, so a 401 after login
  was impossible. The web app was written for that world:
  - `apps/web/src/lib/auth.tsx:29-47` checks `/auth/me` only on mount or token change.
  - `api.ts` has no global 401 handler.
  - The pages read an errored query (`data === undefined`) as "empty" (`cart.tsx:64`, `favorites.tsx:59,65`).
  C3 made mid-session 401s a normal event. Under `pnpm dev` it happens on every API file save,
  because `tsx watch` restarts the server with a new secret (see E4).
- **Why tests missed it:** C3 tests are API-only (forged token → 401, `exp` claim present).
  There were no web tests for session lifecycle.
- **Verified:**
  - API, `node errmd/e3.mjs`: `same boot GET /cart -> 200`. After a rebuild with a new per-boot secret,
    `/auth/me`, `/cart` and `/favorites` all return `401 {"error":"Unauthorized"}`. Token claims are `id,email,iat,exp`, `exp-iat = 3600 s`.
  - UI, `web-c2f/ui.test.tsx` "E3": the server clock is advanced 3601 s after sign-in.
    - `/cart header user shown: true | page: 'Your cart is empty' | calls: GET /cart -> 200, GET /cart -> 401, GET /cart -> 401`
    - `/favorites header user shown: true | page: 'You haven't favorited any personas yet.'`
    - `Add to Cart: POST /cart -> 401 | any error shown in UI: false`
    - `server truth (fresh clock): cart items = 1`
- **Run log:**
  - 2026-09-23 12:59 — `node e3.mjs` → 401 ×3 after restart.
  - 13:07 — vitest `web-c2f/ui.test.tsx -t E3` → reproduced.
  - 13:14 — same test on the 026f1c2 source → the cart page now renders "Sign in to view your cart" and the header no longer shows the user. Fix confirmed.
- **Lesson:** server-side security hardening (expiry, rotation, revocation) needs a matching
  client-side change. A new failure mode on the server is a new state the UI must handle.

### E4. `JWT_SECRET` set in the shell never reaches the API under `pnpm dev`
- **Triggered by:** C3, reading the secret from `process.env.JWT_SECRET` (`apps/api/src/app.ts:20`)
- **Relation:** AMPLIFIED by existing config. Severity **Low**. Evidence ✅ (dry run and runtime replica). Runtime was previously ❓.
- **What happens:** `JWT_SECRET=x pnpm dev` does not pass `x` to the API, so it logs "JWT_SECRET is not set" and every restart invalidates all tokens.
- **Mechanism:** Turbo 2 runs tasks in strict env mode. `turbo.json` declares no `env` or `passThroughEnv`,
  so undeclared variables are stripped. `ENFORCE_AUTH=false` is stripped the same way. It fails safe, but the configuration is silently ignored.
  Running `node dist/index.js` directly is not affected.
- **Why tests missed it:** tests call `buildApp()` directly and never go through turbo.
- **Verified:**
  - `turbo run dev --dry=json` (repo, with `JWT_SECRET=from-shell ENFORCE_AUTH=false` exported) →
    `envMode=strict` and `@acme/api#dev envMode=strict env={"specified":{"env":[],"passThroughEnv":null},...}`.
  - The real `dev` cannot run here, because it binds 3001. Instead, a replica in `errmd/turbo-env/` used the repo's
    `turbo.json` + `pnpm-workspace.yaml`, the repo's turbo 2.8.20 binary, and an `@acme/api` package whose `dev` script prints the env:
    - `@acme/api:dev: JWT_SECRET=undefined ENFORCE_AUTH=undefined`
    - with `--env-mode=loose`: `JWT_SECRET=from-shell ENFORCE_AUTH=false`
  - `app.ts:21-26` logs the "not set" warning whenever the value is missing (see the E9 run: `JWT_SECRET unset warn+ log lines: ['JWT_SECRET is not set; ...']`).
- **Run log:** 2026-09-23 13:03 — `turbo run dev --dry=json` + replica `turbo run dev --ui=stream` → stripped in strict mode, passed in loose mode.
- **Lesson:** a fix that adds an env var is only half-done until the var is plumbed through every
  launcher (turbo, docker, CI) and documented.

### E5. An empty price parameter now filters out everything
- **Triggered by:** M3, validating `/personas` query params with the existing `personaFilterSchema` (`apps/api/src/routes/personas.ts:7`, commit `45ea960`)
- **Relation:** CAUSED. Severity **Low**. Evidence ✅ (API). UI ❓, not run.
- **What happens (re-run; corrected table):**

  | Request | Before M3 | After M3 (observed) |
  |---|---|---|
  | `?maxPrice=` / `?maxPrice=%20` | no filter, all 15 | 200 `[]` (0 personas) |
  | `?minPrice=` | no filter | 200, 15 personas (becomes `minPrice=0`, harmless) |
  | `?specialty=` / `?sort=` | ignored | 400 "Invalid enum value" |
  | `?minPrice=0x10` | NaN (filtered out) | 200, 15 (accepted as 16) |
  | `?minPrice=Infinity` | — | 200, **0** personas |
  | `?maxPrice=Infinity` | — | 200, 15 personas |

  On the web, any 400 renders as "No personas found".
- **Mechanism:** the schema already existed in `packages/shared/src/schemas/persona.ts:47-48`
  but had never been used. `z.coerce.number()` is `Number(x)`, so `""` and `" "` become `0`.
  The old handler's truthy check (`query.maxPrice ? Number(...) : undefined`) happened to treat
  empty as "absent". Adopting the dormant schema changed that contract.
- **Why tests missed it:** M3 tests covered the failure inputs we had evidence for (repeated `q`,
  `abc`, unknown enum, min>max). None covered empty values, which were fine before.
- **Verified:** `node errmd/e5.mjs` → `"?maxPrice=" -> 200 0 personas`, `"?maxPrice=%20" -> 200 0 personas`, `"(none)" -> 200 15 personas`.
- **Run log:** 2026-09-23 13:01 — `node e5.mjs` → reproduced. Table corrected: `?minPrice=` is harmless, and `?minPrice=Infinity` returns 0.
- **Lesson:** wiring up an unused validator changes behavior for inputs that previously worked.
  Diff the old and new behavior over empty, whitespace and boundary inputs, not just the bad ones.

### E6. Login response time reveals whether an email is registered
- **Triggered by:** H4, scrypt (`apps/api/src/routes/auth.ts:70-73`, commit `1d4d3cf`)
- **Relation:** CAUSED. Severity **Low**. Evidence ✅.
- **Mechanism:** `if (!user || !(await verifyPassword(...)))` (`auth.ts:72`) short-circuits, so scrypt runs only when
  the email exists. The old hash cost microseconds, so both paths took about the same time and there was no signal.
- **Why tests missed it:** functional tests don't measure timing.
- **Verified:** `node errmd/e6.mjs` (median of 20) → `registered email + wrong pw: 69.35` ms vs `unknown email: 0.24` ms.
- **Run log:** 2026-09-23 13:01 — `node e6.mjs` → reproduced (about 290× difference).
- **Lesson:** making one branch deliberately expensive creates a timing side channel unless every
  branch pays the same cost (run a dummy hash for unknown users).

### E7. Scrypt with no rate limit can starve all auth requests
- **Triggered by:** H4, scrypt with N=16384 and about 16 MB per call (`auth.ts:17-29`)
- **Relation:** CAUSED. Severity **Low**. Evidence ✅ (now end to end through the route, not a microbench).
- **Mechanism:** login and register are unauthenticated and have no rate limit. Each call occupies one
  of libuv's 4 worker threads for about 68 ms, so a flood queues every real user's login behind it.
  The missing rate limit already existed but didn't matter until each call became expensive.
- **Verified:** `node errmd/e7.mjs`:
  - `victim login alone [status, ms]: [ 200, 69 ]`
  - `64 concurrent bad logins took 1094 ms ... | victim login fired during flood [status, ms]: [ 200, 1124 ] | UV_THREADPOOL_SIZE = (default 4)`
  - The second run gave 1150 ms.
  - Harness note: `light-my-request` inject chains are lazy and dispatch on `.then()`. The first draft dispatched the victim first and showed 82 ms, which was misleading.
- **Run log:** 2026-09-23 13:03 — `node e7.mjs` ×2 → victim latency 69 ms → 1124/1150 ms (about 16×).
- **Lesson:** a deliberately slow hash turns "no rate limiting" from a nit into a DoS vector.

### E8. A malformed stored hash accepts any password
- **Triggered by:** H4, the new `verifyPassword` (`apps/api/src/routes/auth.ts:23-29`, specifically `:26-28`)
- **Relation:** CAUSED, latent (every stored hash comes from `hashPassword`, so this is unreachable today). Severity **Low**. Evidence ✅.
- **Mechanism:** for a stored value like `scrypt$zz$zz`, non-hex decodes to a 0-byte key. scrypt runs
  with `keylen 0`, and `timingSafeEqual(<0 bytes>, <0 bytes>)` returns `true`. The key length is taken
  from the stored value, not from a constant.
- **Verified:** `node errmd/e8.mjs` overwrites the stored hash through the real `db` module, then logs in with a wrong password:
  `stored="scrypt$zz$zz" -> 200`, `stored="scrypt$00$zz" -> 200`, `stored="scrypt$ab$0" -> 200`.
- **Run log:** 2026-09-23 13:01 — `node e8.mjs` → reproduced for all 3 malformed values.
- **Lesson:** the parser for a new storage format must validate lengths and fail closed.
  "Can't happen" data becomes reachable through migrations and bugs elsewhere.

### E9. JWT hardening is incomplete
- **Triggered by:** C3 (`apps/api/src/app.ts:20-27`)
- **Relation:** INCOMPLETE. Severity **Low**. Evidence ✅.
- **What happens:** a token with no `exp` claim is accepted forever. HS512 is accepted.
  `JWT_SECRET=a`, or the old public literal, is used without a warning.
- **Mechanism:** `expiresIn` applies only at *sign* time. Verify options (`algorithms`, `requiredClaims`)
  were never set, and the secret has only a truthiness check (`app.ts:21`).
- **Verified:** `node errmd/e9.mjs` (tokens hand-signed with fast-jwt 5.0.6 and the configured secret):
  - `no-exp HS256 alg: HS256 claims: id,email,iat -> /auth/me 200`
  - `no-exp HS512 alg: HS512 claims: id,email,iat -> /auth/me 200`
  - `JWT_SECRET="a" warn+ log lines: 0 []`
  - `JWT_SECRET="agentic-personas-dev-secret" warn+ log lines: 0 []`
- **Run log:** 2026-09-23 13:01 — `node e9.mjs` → all four claims reproduced.
- **Lesson:** a signing-side fix is not the same as a verification-side guarantee. Enforce the claim where it is checked.

### E10. `ENFORCE_AUTH=false` breaks every protected route
- **Triggered by:** C1, the decision to keep the flag but default it on (`apps/api/src/middleware/auth.ts:4,10-12`)
- **Relation:** CAUSED by an explicit design choice. Severity **Low**. Evidence ✅.
- **What happens:** with `ENFORCE_AUTH=false`, every protected route returns 500, even with a valid token,
  and the body leaks internal error text.
- **Mechanism:** handlers destructure `request.user`, which @fastify/jwt sets only inside `jwtVerify()`.
  The "off" setting skips that call, so `request.user` is null. It was never a working bypass;
  we preserved a mode that could only crash. It fails closed: only the exact string `"false"` disables auth.
- **Verified:** `node errmd/e10.mjs <value>`, with a fresh process per value:
  - `ENFORCE_AUTH="false"`: `GET /cart`, `GET /favorites` and `POST /checkout` return `500 "Cannot destructure property 'id' of 're...` with **and** without a valid token.
    `GET /auth/me` returns `500 "Cannot read properties of null (reading ...`.
  - `ENFORCE_AUTH="FALSE"`, `"0"` and `"true"`: no token → 401, valid token → 200 (fail closed confirmed).
- **Run log:** 2026-09-23 13:01 — `node e10.mjs false|FALSE|0|true` → reproduced.
- **Lesson:** keeping a flag for compatibility preserves its broken modes. Either make each mode work or remove it.

### E11. Hitting the 99-quantity cap fails silently in the UI
- **Triggered by:** M5, capping quantity at 99 (`packages/shared/src/schemas/cart.ts:14,18,24`, and `apps/api/src/routes/cart.ts:52-61`, commit `96ea5da`)
- **Relation:** CAUSED. Severity **Low**. Evidence ✅ (API and UI). UI was previously ❓. **Still reproduces at 026f1c2.**
- **What happens:** "+" at 99, or Add to Cart on a line that already has 99, sends a request that gets 400, and nothing is shown.
- **Mechanism:** a new server-side limit, but the UI was not told:
  - `CartItem.tsx:50` never disables "+". W4 disabled only "-" at 1.
  - `cart.tsx` and `$personaId.tsx` never render mutation errors.
  The readable message from M7 is built but never displayed.
- **Verified:**
  - API, `node errmd/e11.mjs`: `plus at 99 (PUT quantity 100) -> 400 {"error":{..."quantity":["Number must be less than or equal to 99"]}}`.
    `Add to Cart on a 99 line (POST quantity 1) -> 400` (same body).
  - UI, `web-c2f/ui.test.tsx` "E11": `'+' disabled at 99: false`, `'+': PUT /cart/cart-1 -> 400 | error text shown: false`, `Add to Cart: POST /cart -> 400 | error text shown: false`.
- **Run log:** 2026-09-23 13:01 — `node e11.mjs` → reproduced. 13:07 — vitest "E11" at c2f0c62 → reproduced. 13:14 — same test at 026f1c2 → identical output (still open).
- **Lesson:** any new server constraint needs a matching UI affordance or error surface, or it looks like "the button doesn't work".

### E12. Fastify's own errors now display "Bad Request"
- **Triggered by:** M7, the `errorMessage()` helper (`apps/web/src/lib/api.ts:22-45`, used at `:70`, commit `857fdb4`; `:36` at 026f1c2)
- **Relation:** INCOMPLETE. Severity **Low**. Evidence ✅ (response shape and the real web client). **Still reproduces at 026f1c2.**
- **Mechanism:** the helper assumes `error` holds the useful text. For Fastify-generated errors
  (for example E1, or invalid JSON), `error` is the generic `"Bad Request"` and the detail is in `message`.
  M7 was modeled on the route-level zod 400 only. E1 is fixed, so the remaining trigger in practice is a malformed JSON body.
- **Verified:**
  - `node errmd/e12.mjs`: `Fastify-native bad JSON: 400 {"statusCode":400,"code":"FST_ERR_CTP_INVALID_JSON_BODY","error":"Bad Request","message":"Body is not valid JSON ..."}`.
    Compare `route-level zod 400: {"error":{"formErrors":[],"fieldErrors":{...}}}`.
  - Real `api.post` in vitest "E1/E12": `Fastify-native 400 surfaces as error.message: "Bad Request"`, at both c2f0c62 and 026f1c2.
- **Run log:** 2026-09-23 13:01 — `node e12.mjs`. 13:14 — vitest "E1/E12" on both trees → reproduced.
- **Lesson:** an error-body parser has to handle every producer on the server, not just the one in the bug report.

### E13. The shared favorites cache now crashes the detail page
- **Triggered by:** C1, auth enforced by default
- **Relation:** UNMASKED (round-1 H8). Severity **High**. Evidence ✅ (UI). Previously ❓.
- **Status:** FIXED in 898a2bd (W1, H5 H8). The `["favorites"]` key now has one shape, and the detail page derives the ids with `select`.
- **What happened (c2f0c62):** open /favorites, then any persona, and the page throws `favorites.includes is not a function`.
  *New, reverse direction:* open a persona first, then /favorites within the 60 s staleTime. The page then shows
  "You haven't favorited any personas yet." even though the server has favorites.
- **Mechanism:** `$personaId.tsx:22-30` cached `string[]` and `favorites.tsx:16-20` caches `{favorites: Persona[]}`
  under the same key `["favorites"]`. Before C1 was fixed, `GET /favorites` always returned 500,
  so neither cache was ever populated and the collision never happened.
- **Verified:** `web-c2f/ui.test.tsx` "E13":
  - `cache after /favorites: {"favorites":[{"id":"p-001",...` then, after navigating to a persona, the router logs `Warning: favorites.includes is not a function`.
  - Reverse: `cache after persona page: ["p-001"]` → `/favorites shows 'You haven't favorited any personas yet.' while server has 1 favorite(s)`.
- **Run log:** 2026-09-23 13:07 — vitest "E13" at c2f0c62 → reproduced both directions.
  13:11 — same test at 42044a2, and again at 026f1c2 → `expected '' to match /includes is not a function/` (no error). Fix confirmed.
- **Lesson:** a crash high in the stack hides every bug below it. Fixing the top error guarantees the next layer becomes reachable.

### E14. Signing out, then reloading, signs you back in
- **Triggered by:** C1
- **Relation:** UNMASKED + AMPLIFIED (round-1 H9). Severity **High**. Evidence ✅ (UI). Previously 📖 / ❓.
- **Status:** FIXED in 026f1c2 (W2). Logout removes `auth_token` and calls `queryClient.clear()`. Login also clears the cache.
- **What happened (c2f0c62):** "Sign out" then reload restored the session. User B could also see user A's cached
  cart, and "Place Order" charged B's server cart, which differed from what was displayed.
- **Mechanism:** logout (`auth.tsx:55-58`) never removed `auth_token` or cleared the query cache. Before C1, `/auth/me`
  always returned 500, so restoring a session from the leftover token never worked. Now it did.
- **Verified:** `web-c2f/ui.test.tsx` "E14":
  - `after Sign out: auth_token still in localStorage: true | ['cart'] cache still holds: [ 'Refactor Rex' ]`
  - `after reload: header shows 'alice' again`
  - `bobby's checkout page lists: [ 'Refactor Rex' ] | bobby's server cart: [ 'Scope Creep Sam x3' ]`
  - `Place Order: POST /checkout -> 201 | alice server cart after: 1 items | bobby server cart after: 0 items`
- **Run log:** 2026-09-23 13:07 — vitest "E14" at c2f0c62 → reproduced.
  13:14 — same test at 026f1c2 → `auth_token still in localStorage: false | ['cart'] cache still holds: undefined`, and the reload no longer shows "alice". Fix confirmed.
- **Lesson:** same pattern as E13. A dormant client bug becomes live when its server dependency starts working.

### E15. A stale `/auth/me` response can delete a freshly issued token
- **Triggered by:** C1
- **Relation:** UNMASKED (round-1 L5). Severity **Low**. Evidence ✅ (UI). Previously ❓.
- **Status:** FIXED in 026f1c2 (W2). The `/auth/me` effect ignores results from a token that is no longer current.
  The 401 handler also acts only if the rejected token is still the stored one.
- **Mechanism:** the `removeItem("auth_token")` branch in `auth.tsx:41-44` runs only on a 401, which was
  unreachable while `/auth/me` always returned 500. Now a slow, stale 401 can remove a token that `login()` just stored.
  The user then looks signed in while every request is anonymous.
- **Verified:** `web-c2f/ui.test.tsx` "E15". The stale token's `/auth/me` is delayed 1.5 s, and the user logs in through the real form meanwhile.
  - `token right after login set: true | after stale 401 arrives: null | header still shows erin: true`
  - `calls: GET /auth/me -> 401, POST /auth/login -> 200, ..., GET /cart -> 401, GET /cart -> 401`
- **Run log:** 2026-09-23 13:07 — vitest "E15" at c2f0c62 → reproduced.
  13:14 — same test at 026f1c2 → the token survives (`after stale 401 arrives: eyJ...`) and a later `GET /cart -> 200`. Fix confirmed.

### E16. The cart badge now contradicts the server after every checkout
- **Triggered by:** H3, checkout now clears the cart (commit `96ea5da`)
- **Relation:** AMPLIFIED (round-1 M6). Severity **Medium**. Evidence ✅ (UI). Previously 📖.
- **Status:** FIXED in 75dadf4 (W4, M6/E16 M9). The badge key is now `["cart","count"]`, under the `["cart"]` prefix that every cart mutation invalidates. See E19 for its side effect.
- **Mechanism:** the nav badge used the key `["cart-count"]` (`__root.tsx:16`), which no mutation invalidates.
  Before H3 the server never emptied the cart, so the stale badge happened to be right.
  After H3 it always showed the pre-checkout count.
- **Verified:** `web-c2f/ui.test.tsx` "E16" → `badge after order: 3 | server cart items: 0 | ['cart-count'] state: false`.
- **Run log:** 2026-09-23 13:07 — vitest "E16" at c2f0c62 → reproduced.
  13:11, and again 13:14 (026f1c2) → `badge after order: null | server cart items: 0`. Fix confirmed.
- **Lesson:** fixing data correctness on the server makes client caches with broken invalidation *visibly* wrong.

### E17. The test harness asserted the M2 bug, and its config comment is stale
- **Triggered by:** phase-0 harness (`apps/api/test/harness.test.ts`, `apps/api/vitest.config.ts`, commit `5bcddb1`)
- **Relation:** CAUSED. Severity **Low**. Evidence ✅. One sub-claim was not reproduced (see the correction below).
- **What happened:**
  - The second harness test proved per-test isolation with `expect(first.id).toBe(second.id)` (`5bcddb1:apps/api/test/harness.test.ts:22`),
    which is exactly the id reuse that M2 is about. Group A had to rewrite it.
  - `vitest.config.ts:15` forces `ENFORCE_AUTH=true` for every suite. Its comment on `:14`, "Pre-fix, auth is opt-in", is stale and still present at 026f1c2.
  - `cart.test.ts` and `checkout.test.ts` never call `app.close()` (`grep close` → no matches in either file).
- **Correction, NOT REPRODUCED:** the earlier claim that the forced config "hides the production default" no longer holds.
  After C1, unset and `"true"` behave the same: `node errmd/e17b.mjs` → `ENFORCE_AUTH unset (production default) GET /cart no token -> 401`.
  The forced value is now redundant, not masking. Only the comment is wrong.
- **Mechanism:** the harness was designed around the *buggy* behavior (sequential ids, auth off),
  to keep the other suites from being blocked by C1.
- **Verified:** the old assertion's premise was run as two fresh processes against c2f0c62 dist (`node errmd/e17.mjs` ×2), registering the same email in each:
  `first=user-25f069d7-... second=user-bdfe7b8d-... equal=false`. The original harness assertion would fail on the fixed code.
- **Run log:** 2026-09-23 13:05 — `git show 5bcddb1:apps/api/test/harness.test.ts`, `node e17.mjs` ×2, `node e17b.mjs`, grep → reproduced, except the "hides default" sub-claim.
- **Lesson:** test scaffolding written before a fix tends to encode the bug. Review harness assertions
  and forced config after the fixes land.

### E18. Test and build pipeline blind spots introduced with the harness
- **Triggered by:** phase-0 turbo `test` task and vitest aliases
- **Relation:** CAUSED (process). Severity **Low**. Evidence ✅ (all three bullets executed).
- **What happens:**
  - `turbo.json` `"test": {"outputs": []}` has no dependency on `packages/shared`, so editing a shared
    schema can replay a cached PASS.
  - `apps/api/tsconfig.json` includes only `src`, so API test files are never typechecked.
  - Tests alias `@acme/shared` to source, while `pnpm dev` and `start` use `dist`. With a stale `dist`,
    tests pass but the API crashes at boot (`addFavoriteSchema` missing).
- **Verified:**
  - `turbo run test --dry=json` → `task=@acme/api#test dependencies= inputs-count=21 inputs-has-shared=False`.
    The web and shared test tasks show the same.
  - `tsc -p apps/api/tsconfig.json --listFilesOnly | grep -ci apps/api/test` → `0`. Only the 9 `src/` files are listed.
  - `packages/shared` from `1905963` (before `addFavoriteSchema`) was compiled into `errmd/stale/`. Booting the c2f0c62
    API dist against it (`node --import ./stale-register.mjs e18boot.mjs`) gives
    `SyntaxError: The requested module '@acme/shared' does not provide an export named 'addFavoriteSchema'`.
    With the current shared dist, the output is `booted {"status":"ok"}`.
- **Run log:** 2026-09-23 13:03–13:06 — turbo dry run, tsc listFilesOnly, stale-dist boot → all reproduced.
- **Lesson:** aliasing to source makes tests fast and deterministic, but separates what is tested from
  what runs. Pair it with a pipeline dependency that forces a rebuild.

### E19. Every cart mutation on /cart and /checkout now fetches the cart twice
- **Triggered by:** the W4 fix for M6/E16 (`75dadf4`). It moved the nav badge key from `["cart-count"]` to `["cart","count"]` (`apps/web/src/routes/__root.tsx:16-17` at 026f1c2).
- **Relation:** CAUSED. Severity **Low**. Evidence ✅.
- **What happens:** on /cart (and /checkout), both `["cart"]` (page) and `["cart","count"]` (badge) are
  active queries for the same `GET /cart`. Every `invalidateQueries({ queryKey: ["cart"] })` now refetches both,
  so one "+" click costs one PUT plus two identical GETs.
- **Mechanism:** the fix reused prefix invalidation to reach the badge but kept two separate cache entries for one
  resource. A badge that derives from `["cart"]`, or uses `select` on the same key, would need one fetch.
- **Why tests missed it:** W4's tests assert that the badge updates, not how many requests it takes.
- **Verified:** `web-*/ui.test.tsx` "E19":
  - c2f0c62: `/cart '+': PUT /cart/cart-1 -> 200, GET /cart -> 200 | GET /cart count: 1 | cart queries in cache: [["cart"]]`.
  - 026f1c2: `/cart '+': PUT /cart/cart-1 -> 200, GET /cart -> 200, GET /cart -> 200 | GET /cart count: 2 | cart queries in cache: [["cart","count"],["cart"]]`.
  - On the persona page, Add to Cart goes from 0 to 1 GET. That GET is the intended fix, not a regression.
- **Run log:** 2026-09-23 13:11 (42044a2) and 13:14 (026f1c2) — vitest "E19" → 2 GETs per mutation on /cart.
- **Lesson:** fixing invalidation by adding a second key for the same resource trades staleness for duplicate traffic.
  Prefer one key with `select`.

### E20. Session reset clears public caches, and the 401 handler is a single global slot
- **Triggered by:** the W2 fix for H9/E3/L5 (`026f1c2`: `apps/web/src/lib/auth.tsx:32-48,73-79`, `apps/web/src/lib/api.ts:21-26`)
- **Relation:** CAUSED. Severity **Low**. Evidence ✅, except that the logout part of the refetch claim was not reproduced.
- **What happens:**
  1. `queryClient.clear()` on login, logout and 401 also drops public caches such as `["personas"]`. The browse page
     refetches `/personas` after login, where c2f0c62 served it from cache within the 60 s staleTime.
  2. A 401 does not redirect. Each page shows its own signed-out state (for example "Sign in to view your cart").
  3. The 401 handler is one module-level variable (`api.ts:22`). A second AuthProvider that unmounts runs
     `setUnauthorizedHandler(null)`, which silently disables 401 handling for the one still mounted.
- **Verified:**
  - Refetch after login (`ui.test.tsx` "E20a"). At c2f0c62: `after login -> '/': POST /auth/login -> 200, GET /cart -> 200, GET /auth/me -> 200 | GET /personas: 0`.
    At 026f1c2: `... GET /auth/me -> 200, GET /personas -> 200 | GET /personas: 1`.
  - Refetch after logout: **not reproduced as an immediate refetch.** `after Sign out: | GET /personas: 0` at 026f1c2, while staying on "/".
    The mounted observer keeps showing its data. The cleared cache only costs a fetch on the next mount.
  - Redirect: the E3 test at 026f1c2 → the /cart page renders "Sign in to view your cart" and stays on /cart.
  - Handler slot ("E20b", 026f1c2):
    - one provider → `{"calls":"GET /cart -> 401","tokenLeft":null}`
    - two providers, second unmounted → `{"calls":"GET /cart -> 401","tokenLeft":"stale.token.value"}` (401 ignored)
- **Why tests missed it:** W2's session tests render a single AuthProvider and assert only session state, not
  request counts for public data.
- **Run log:** 2026-09-23 13:14 — vitest "E20a" on c2f0c62 and 026f1c2, and "E20b" on 026f1c2 → reproduced as described.
- **Lesson:** "clear everything" is the safe default for a session reset, but it has a cost. Scope it to user data (for example
  `removeQueries` on user keys) when public data is expensive. Avoid module-level singletons for per-provider callbacks.

---

## Patterns (why fixes keep breaking unrelated things here)

1. **Crash masking (E1, E13, E14, E15).** C1 (every protected route returned 500) and H1 (every DELETE
   blocked at preflight) sat at the top of their request paths. Everything downstream had never run in
   the real app, so fixing the top layer exposed the layer below. Expect more of this until the web
   client's paths have run end to end.
2. **Sync → async (E2).** One `await` added for security (scrypt) removed an atomicity guarantee
   nobody knew the code relied on.
3. **Server changes without client changes (E3, E11, E12, E16).** Expiry, caps and new error shapes
   are new states the web app was never written for, and it has almost no error UI.
4. **Adopting dormant contracts (E5).** Wiring up a schema that existed but was never used changed
   behavior for inputs that used to work.
5. **Hardening only at the edge we tested (E6–E10).** Each fix was verified against the exact
   exploit we had, but not against the neighboring cases in the same area.
6. **Scaffolding shaped by the bug (E17, E18).** The harness was built to work around C1 and M2,
   and it kept those assumptions after both were fixed.

## Still to add
- Mutation-test gaps (round 2) are tracked in NEXT-Steps.md, not here.
