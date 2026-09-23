import { fresh, register, auth } from "./common.mjs";
const app = await fresh();
const { body } = await register(app);
const t = body.token;
const pid = (await app.inject({ method: "GET", url: "/personas" })).json()[0].id;
const add = await app.inject({ method: "POST", url: "/cart", headers: { ...auth(t), "content-type": "application/json" }, payload: { personaId: pid, quantity: 1 } });
const itemId = add.json().items[0].id;
const pre = await app.inject({ method: "OPTIONS", url: `/cart/${itemId}`, headers: { origin: "http://localhost:5173", "access-control-request-method": "DELETE", "access-control-request-headers": "authorization,content-type" } });
console.log("preflight", pre.statusCode, "allow-methods:", pre.headers["access-control-allow-methods"]);
// Exactly as apps/web/src/lib/api.ts:52-55,92 sends it: Content-Type json, no body
const d1 = await app.inject({ method: "DELETE", url: `/cart/${itemId}`, headers: { ...auth(t), "content-type": "application/json", origin: "http://localhost:5173" } });
console.log("DELETE /cart/:id web-client headers ->", d1.statusCode, d1.body);
await app.inject({ method: "POST", url: "/favorites", headers: auth(t), payload: { personaId: pid } });
const f1 = await app.inject({ method: "DELETE", url: `/favorites/${pid}`, headers: { ...auth(t), "content-type": "application/json" } });
console.log("DELETE /favorites/:id web-client headers ->", f1.statusCode, f1.body);
const d2 = await app.inject({ method: "DELETE", url: `/cart/${itemId}`, headers: auth(t) });
console.log("DELETE /cart/:id no content-type ->", d2.statusCode, d2.body);
await app.close();
