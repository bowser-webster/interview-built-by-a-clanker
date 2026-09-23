const { buildApp } = await import("../../../apps/api/dist/app.js");
const app = await buildApp();
console.log("booted", (await app.inject({ url: "/health" })).body);
