import { fresh, register } from "./common.mjs";
const app = await fresh();
const { email } = await register(app);
async function time(e, n = 20) {
  const ts = [];
  for (let i = 0; i < n; i++) {
    const s = process.hrtime.bigint();
    await app.inject({ method: "POST", url: "/auth/login", payload: { email: e, password: "wrongpass" } });
    ts.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  ts.sort((a, b) => a - b);
  return ts[Math.floor(n / 2)].toFixed(2);
}
await time(email, 3);
console.log("median login ms, registered email + wrong pw:", await time(email));
console.log("median login ms, unknown email:", await time("nobody@x.io"));
await app.close();
