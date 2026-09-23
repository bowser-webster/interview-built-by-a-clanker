delete process.env.ENFORCE_AUTH;
const { buildApp } = await import("../../../apps/api/dist/app.js");
const app = await buildApp();
const r = await app.inject({ url: "/cart" });
console.log("ENFORCE_AUTH unset (production default) GET /cart no token ->", r.statusCode, r.body);
