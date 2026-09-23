import { createSigner } from "../../../node_modules/.pnpm/fast-jwt@5.0.6/node_modules/fast-jwt/src/index.js";
import { Writable } from "node:stream";
const logs = [];
const stream = new Writable({ write(c, _e, cb) { logs.push(c.toString()); cb(); } });
async function build(secret, tag) {
  if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
  logs.length = 0;
  const { buildApp } = await import(`../../../apps/api/dist/app.js?v=${tag}`);
  return buildApp({ logger: { level: "warn", stream } });
}
const SECRET = "test-secret-e9";
let app = await build(SECRET, "e9a");
const reg = await app.inject({ method: "POST", url: "/auth/register", payload: { username: "e9user", email: "e9@x.io", password: "password" } });
const id = reg.json().user.id;
const noExp = createSigner({ key: SECRET, algorithm: "HS256" })({ id, email: "e9@x.io" });
const hs512 = createSigner({ key: SECRET, algorithm: "HS512" })({ id, email: "e9@x.io" });
const part = (t, i) => JSON.parse(Buffer.from(t.split(".")[i], "base64url"));
for (const [n, t] of [["no-exp HS256", noExp], ["no-exp HS512", hs512]]) {
  const r = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${t}` } });
  console.log(n, "alg:", part(t, 0).alg, "claims:", Object.keys(part(t, 1)).join(","), "-> /auth/me", r.statusCode);
}
await app.close();
for (const s of ["a", "agentic-personas-dev-secret"]) {
  app = await build(s, "e9" + s);
  console.log(`JWT_SECRET=${JSON.stringify(s)} warn+ log lines:`, logs.length, logs.map((l) => JSON.parse(l).msg));
  await app.close();
}
app = await build(undefined, "e9none");
console.log("JWT_SECRET unset warn+ log lines:", logs.map((l) => JSON.parse(l).msg));
await app.close();
