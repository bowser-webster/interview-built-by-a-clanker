// API smoke: spawns the built API twice (ENFORCE_AUTH unset, then "true") and records every response.
// Usage: pnpm build && pnpm smoke:api [outFile]   (default: .smoke-output/api-smoke.txt). Uses port 3001.
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(process.argv[2] ?? resolve(REPO, ".smoke-output/api-smoke.txt"));
mkdirSync(dirname(OUT), { recursive: true });
const BASE = "http://localhost:3001";
writeFileSync(OUT, `Smoke run ${new Date().toISOString()}\n`);
const log = (s) => { appendFileSync(OUT, s + "\n"); process.stdout.write(s + "\n"); };

function summarize(body) {
  if (Array.isArray(body) && body.length && body[0]?.price !== undefined) {
    return `[${body.length} personas] ` + body.map((p) => `${p.id}:$${p.price}:r${p.rating}:${p.specialty}`).join(", ");
  }
  if (body && Array.isArray(body.items)) {
    return `{${body.id ? "order " + body.id + " user=" + body.userId + " " : ""}items:[` + body.items.map((i) => `${i.id}:${i.personaId}@${i.persona?.price}x${i.quantity}`).join(", ") + `], total:${body.total}}`;
  }
  if (body && Array.isArray(body.favorites)) return `{favorites:[${body.favorites.map((p) => p.id).join(",")}]}`;
  const s = JSON.stringify(body);
  return s.length > 700 ? s.slice(0, 700) + "...(truncated)" : s;
}

async function req(label, method, path, { body, token, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (token) h["authorization"] = `Bearer ${token}`;
  let res, text;
  try {
    res = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    text = await res.text();
  } catch (e) {
    log(`${label}\n  ${method} ${path} -> NETWORK ERROR ${e.message}`);
    return { status: 0 };
  }
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  log(`${label}\n  ${method} ${path}${body !== undefined ? " body=" + JSON.stringify(body) : ""}${token ? " [token]" : ""}\n  -> ${res.status} ${summarize(parsed)}`);
  return { status: res.status, body: parsed, headers: res.headers };
}

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function runMode(mode) {
  log(`\n==================== MODE: ENFORCE_AUTH=${mode ?? "(unset)"} ====================`);
  const env = { ...process.env };
  delete env.ENFORCE_AUTH;
  if (mode) env.ENFORCE_AUTH = mode;
  const srv = spawn(process.execPath, ["dist/index.js"], { cwd: REPO + "/apps/api", env });
  let srvLog = "";
  srv.stdout.on("data", (d) => (srvLog += d));
  srv.stderr.on("data", (d) => (srvLog += d));
  if (!(await waitUp())) { log("SERVER DID NOT START\n" + srvLog); srv.kill(); return; }

  log("\n--- Public ---");
  await req("health", "GET", "/health");
  await req("all personas", "GET", "/personas");
  await req("minPrice=50", "GET", "/personas?minPrice=50");
  await req("maxPrice=50", "GET", "/personas?maxPrice=50");
  await req("minPrice=50&maxPrice=60", "GET", "/personas?minPrice=50&maxPrice=60");
  await req("sort=price-asc", "GET", "/personas?sort=price-asc");
  await req("sort=rating-desc", "GET", "/personas?sort=rating-desc");
  await req("specialty=Security", "GET", "/personas?specialty=Security");
  await req("q=rex", "GET", "/personas?q=rex");
  await req("sort=price-desc", "GET", "/personas?sort=price-desc");
  await req("sort=name-asc (names not shown; ids)", "GET", "/personas?sort=name-asc");
  await req("minPrice=0", "GET", "/personas?minPrice=0");
  await req("persona p-001", "GET", "/personas/p-001");
  await req("persona nope", "GET", "/personas/nope");

  log("\n--- Auth ---");
  const reg = await req("register alice", "POST", "/auth/register", { body: { username: "alice", email: "alice@x.com", password: "secret123" } });
  await req("register alice again", "POST", "/auth/register", { body: { username: "alice2", email: "alice@x.com", password: "secret123" } });
  const login = await req("login alice", "POST", "/auth/login", { body: { email: "alice@x.com", password: "secret123" } });
  const u = login.body?.user ?? {};
  log(`  AuthResponse check (login): user keys=${JSON.stringify(Object.keys(u))} hasUsername=${"username" in u}`);
  log(`  AuthResponse check (register): user keys=${JSON.stringify(Object.keys(reg.body?.user ?? {}))}`);
  const A = login.body?.token ?? reg.body?.token;
  await req("me with token", "GET", "/auth/me", { token: A });
  await req("me without token", "GET", "/auth/me");
  await req("me garbage token", "GET", "/auth/me", { token: "garbage.token.value" });

  log("\n--- Cart/favorites as alice ---");
  const c1 = await req("add p-001 x2", "POST", "/cart", { token: A, body: { personaId: "p-001", quantity: 2 } });
  await req("add p-001 x2 again", "POST", "/cart", { token: A, body: { personaId: "p-001", quantity: 2 } });
  const cart = await req("get cart", "GET", "/cart", { token: A });
  const itemId = cart.body?.items?.[0]?.id ?? c1.body?.items?.[0]?.id ?? "cart-1";
  log(`  (alice item id = ${itemId})`);
  await req("put qty 0", "PUT", `/cart/${itemId}`, { token: A, body: { quantity: 0 } });
  await req("put qty 3", "PUT", `/cart/${itemId}`, { token: A, body: { quantity: 3 } });
  await req("fav add p-002", "POST", "/favorites", { token: A, body: { personaId: "p-002" } });
  await req("fav list", "GET", "/favorites", { token: A });
  await req("fav delete p-002", "DELETE", "/favorites/p-002", { token: A });
  await req("fav list after delete", "GET", "/favorites", { token: A });
  await req("fav add {}", "POST", "/favorites", { token: A, body: {} });
  await req("fav add personaId:123", "POST", "/favorites", { token: A, body: { personaId: 123 } });

  log("\n--- Cross-user (bob) ---");
  const bobReg = await req("register bob", "POST", "/auth/register", { body: { username: "bobby", email: "bob@x.com", password: "secret123" } });
  const B = bobReg.body?.token;
  await req("bob PUT alice item", "PUT", `/cart/${itemId}`, { token: B, body: { quantity: 9 } });
  await req("bob GET cart", "GET", "/cart", { token: B });
  await req("alice GET cart (after bob PUT)", "GET", "/cart", { token: A });
  await req("bob DELETE alice item", "DELETE", `/cart/${itemId}`, { token: B });
  await req("alice GET cart (after bob DELETE)", "GET", "/cart", { token: A });

  log("\n--- Checkout as alice ---");
  await req("alice re-add p-003 x1", "POST", "/cart", { token: A, body: { personaId: "p-003", quantity: 1 } });
  await req("checkout", "POST", "/checkout", { token: A, body: { name: "A", email: "a@x.com" } });
  await req("cart after checkout", "GET", "/cart", { token: A });
  await req("checkout again", "POST", "/checkout", { token: A, body: { name: "A", email: "a@x.com" } });

  log("\n--- Protected routes, NO Authorization header ---");
  await req("noauth GET /cart", "GET", "/cart");
  await req("noauth POST /cart", "POST", "/cart", { body: { personaId: "p-001", quantity: 1 } });
  await req("noauth PUT /cart/cart-1", "PUT", "/cart/cart-1", { body: { quantity: 1 } });
  await req("noauth DELETE /cart/cart-1", "DELETE", "/cart/cart-1");
  await req("noauth GET /favorites", "GET", "/favorites");
  await req("noauth POST /favorites", "POST", "/favorites", { body: { personaId: "p-001" } });
  await req("noauth DELETE /favorites/p-001", "DELETE", "/favorites/p-001");
  await req("noauth POST /checkout", "POST", "/checkout", { body: { name: "A", email: "a@x.com" } });
  await req("noauth GET /auth/me", "GET", "/auth/me");
  await req("health after all (server alive?)", "GET", "/health");

  log("\n--- CORS preflight ---");
  const pf = await req("preflight DELETE", "OPTIONS", "/cart/cart-1", {
    headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "DELETE", "Access-Control-Request-Headers": "authorization,content-type" },
  });
  log(`  Access-Control-Allow-Methods: ${pf.headers?.get("access-control-allow-methods")}`);
  log(`  Access-Control-Allow-Origin: ${pf.headers?.get("access-control-allow-origin")}`);
  const pf2 = await req("preflight PUT", "OPTIONS", "/cart/cart-1", {
    headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "PUT" },
  });
  log(`  Access-Control-Allow-Methods: ${pf2.headers?.get("access-control-allow-methods")}`);

  srv.kill();
  await new Promise((r) => srv.on("exit", r));
  const errLines = srvLog.split("\n").filter((l) => /"level":(50|40)|Error|error/.test(l));
  log(`\n--- Server error/warn log lines (${errLines.length}) ---`);
  for (const l of errLines.slice(0, 40)) {
    try { const j = JSON.parse(l); log(`  [${j.level}] ${j.msg ?? ""} ${j.err ? j.err.type + ": " + j.err.message : ""} ${j.req?.url ?? ""}`); }
    catch { log("  " + l.slice(0, 300)); }
  }
}

await runMode(undefined);
await runMode("true");
log("\nDONE");
