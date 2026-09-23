// usage: node e10.mjs <ENFORCE_AUTH value>   (fresh process per value; middleware reads env at module load)
process.env.ENFORCE_AUTH = process.argv[2];
const { buildApp } = await import("../../../apps/api/dist/app.js");
const app = await buildApp();
const reg = await app.inject({ method: "POST", url: "/auth/register", payload: { username: "e10user", email: "e10@x.io", password: "password" } });
const t = reg.json().token;
for (const [m, u, p] of [["GET", "/cart"], ["GET", "/favorites"], ["GET", "/auth/me"], ["POST", "/checkout", { name: "n", email: "n@x.io" }]]) {
  const noTok = await app.inject({ method: m, url: u, payload: p });
  const withTok = await app.inject({ method: m, url: u, payload: p, headers: { authorization: `Bearer ${t}` } });
  console.log(`ENFORCE_AUTH=${JSON.stringify(process.argv[2])}`, m, u, "| no token ->", noTok.statusCode, noTok.body.slice(0, 100), "| valid token ->", withTok.statusCode, withTok.body.slice(0, 100));
}
await app.close();
