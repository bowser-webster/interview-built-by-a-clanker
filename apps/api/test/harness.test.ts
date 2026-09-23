import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshApp, registerUser } from "./helpers.js";

describe("test harness", () => {
  let app: FastifyInstance;
  afterEach(async () => app?.close());

  it("serves /health from buildApp without listening", async () => {
    app = await freshApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("gives each freshApp isolated in-memory state", async () => {
    app = await freshApp();
    await registerUser(app, { email: "same@example.com" });
    await app.close();
    app = await freshApp();
    // A shared store would reject the repeat email with 409.
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { username: "sameuser", email: "same@example.com", password: "secret123" },
    });
    expect(res.statusCode).toBe(201);
  });
});
