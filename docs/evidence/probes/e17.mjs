import { fresh, register } from "./common.mjs";
const app = await fresh();
const r = await register(app, "same@example.com", "secret123", "sameuser");
console.log(r.body.user.id);
await app.close();
