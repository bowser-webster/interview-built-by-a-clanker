import { fresh, register } from "./common.mjs";
import { db } from "../../../apps/api/dist/db.js";
const app = await fresh();
const { email } = await register(app, "mal@x.io", "realpassword");
const u = db.users.getByEmail(email);
for (const stored of ["scrypt$zz$zz", "scrypt$00$zz", "scrypt$ab$0"]) {
  u.passwordHash = stored;
  const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "totally-wrong" } });
  console.log(`stored=${JSON.stringify(stored)} login with a wrong password ->`, r.statusCode);
}
await app.close();
