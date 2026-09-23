import { buildApp } from "./app.js";

const app = await buildApp({ logger: true });

try {
  await app.listen({ port: 3001, host: "0.0.0.0" });
  console.log("API server running on http://localhost:3001");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
