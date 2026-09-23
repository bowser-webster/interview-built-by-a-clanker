import { vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Builds a fresh app with fresh in-memory state. db.ts and the route modules
 * hold module-level Maps and counters, so modules are reset before each build.
 */
export async function freshApp(): Promise<FastifyInstance> {
  vi.resetModules();
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp({ logger: false });
  await app.ready();
  return app;
}

let seq = 0;

/** Registers a unique user and returns its token and id. */
export async function registerUser(
  app: FastifyInstance,
  overrides: Partial<{ username: string; email: string; password: string }> = {},
) {
  seq++;
  const body = {
    username: `user${seq}xx`,
    email: `user${seq}@example.com`,
    password: "secret123",
    ...overrides,
  };
  const res = await app.inject({ method: "POST", url: "/auth/register", payload: body });
  if (res.statusCode !== 201) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const json = res.json() as { token: string; user: { id: string } };
  return { token: json.token, id: json.user.id, ...body };
}

export function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}
