import { fresh, register, auth } from "./common.mjs";
delete process.env.JWT_SECRET;
const app1 = await fresh("a");
const { body } = await register(app1);
const ok = await app1.inject({ method: "GET", url: "/cart", headers: auth(body.token) });
console.log("same boot GET /cart ->", ok.statusCode);
await app1.close();
const app2 = await fresh("b"); // simulates tsx-watch restart: new random secret
for (const u of ["/auth/me", "/cart", "/favorites"]) {
  const r = await app2.inject({ method: "GET", url: u, headers: auth(body.token) });
  console.log("after restart GET", u, "->", r.statusCode, r.body);
}
const payload = JSON.parse(Buffer.from(body.token.split(".")[1], "base64url"));
console.log("token claims:", Object.keys(payload).join(","), "exp-iat =", payload.exp - payload.iat, "s");
await app2.close();
