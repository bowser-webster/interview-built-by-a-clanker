import { fresh } from "./common.mjs";
const app = await fresh();
for (const q of ["", "?maxPrice=", "?maxPrice=%20", "?minPrice=", "?specialty=", "?sort=", "?minPrice=0x10", "?minPrice=Infinity", "?maxPrice=Infinity"]) {
  const r = await app.inject({ method: "GET", url: "/personas" + q });
  const b = r.json();
  console.log(JSON.stringify(q || "(none)"), "->", r.statusCode, Array.isArray(b) ? `${b.length} personas` : JSON.stringify(b).slice(0, 120));
}
await app.close();
