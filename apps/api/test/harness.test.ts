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
    const first = await registerUser(app, { email: "same@example.com" });
    await app.close();
    app = await freshApp();
    const second = await registerUser(app, { email: "same@example.com" });
    expect(first.id).toBe(second.id);
  });
});
