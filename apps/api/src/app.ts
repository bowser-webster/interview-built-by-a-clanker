import { randomBytes } from "node:crypto";
import Fastify, { type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { personaRoutes } from "./routes/personas.js";
import { authRoutes } from "./routes/auth.js";
import { cartRoutes } from "./routes/cart.js";
import { favoriteRoutes } from "./routes/favorites.js";
import { checkoutRoutes } from "./routes/checkout.js";

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  await app.register(cors, {
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  let secret = process.env.JWT_SECRET;
  if (!secret) {
    // No configured secret: use a random per-boot one so tokens can't be forged
    // and don't survive a restart.
    secret = randomBytes(32).toString("hex");
    app.log.warn("JWT_SECRET is not set; using a random per-boot secret. Tokens will not survive a restart.");
  }
  await app.register(jwt, { secret, sign: { expiresIn: "1h" } });

  await app.register(personaRoutes);
  await app.register(authRoutes);
  await app.register(cartRoutes);
  await app.register(favoriteRoutes);
  await app.register(checkoutRoutes);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
