import { fresh, register } from "./common-src.mjs";
const app = await fresh();
const email = "race@x.io";
const [a, b] = await Promise.all([register(app, email, "passwordAAA", "alice"), register(app, email, "passwordBBB", "bobby")]);
console.log("parallel register ->", a.status, b.status, "ids:", a.body.user?.id, b.body.user?.id);
for (const pw of ["passwordAAA", "passwordBBB"]) {
  const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: pw } });
  console.log("login", pw, "->", r.statusCode);
}
const seq = await register(app, email, "passwordCCC", "carol");
console.log("sequential 3rd register ->", seq.status);
await app.close();
