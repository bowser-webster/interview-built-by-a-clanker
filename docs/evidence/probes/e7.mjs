import { fresh, register } from "./common.mjs";
const app = await fresh();
await register(app, "victim@x.io", "victimpass");
await register(app, "flood@x.io", "floodpass1");
async function victimLogin() {
  const s = Date.now();
  const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "victim@x.io", password: "victimpass" } });
  return [r.statusCode, Date.now() - s];
}
console.log("victim login alone [status, ms]:", await victimLogin());
const s = Date.now();
const floodP = Array.from({ length: 64 }, () => app.inject({ method: "POST", url: "/auth/login", payload: { email: "flood@x.io", password: "wrong" } }));
const floodAll = Promise.all(floodP); // light-my-request Chain is lazy: dispatches on .then()
const v = victimLogin();
const rs = await floodAll;
const floodMs = Date.now() - s;
const vr = await v;
console.log("64 concurrent bad logins took", floodMs, "ms, statuses", [...new Set(rs.map((r) => r.statusCode))], "| victim login fired during flood [status, ms]:", vr, "| UV_THREADPOOL_SIZE =", process.env.UV_THREADPOOL_SIZE ?? "(default 4)");
await app.close();
