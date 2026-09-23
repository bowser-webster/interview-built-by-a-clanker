import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshApp } from "./helpers.js";

describe("concurrent registration (E2)", () => {
  let app: FastifyInstance;
  afterEach(async () => app?.close());

  function register(password: string, username: string) {
    return app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { username, email: "dup@example.com", password },
    });
  }

  // scrypt is async: an `await` between the duplicate-email check and the insert
  // lets both requests pass the check.
  it("lets exactly one of two simultaneous same-email registrations succeed", async () => {
    app = await freshApp();
    const results = await Promise.all([register("pw111111", "first"), register("pw222222", "second")]);
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("leaves the winner able to log in with their own password", async () => {
    app = await freshApp();
    const [a, b] = await Promise.all([register("pw111111", "first"), register("pw222222", "second")]);
    const winnerPassword = a.statusCode === 201 ? "pw111111" : "pw222222";
    expect([a.statusCode, b.statusCode]).toContain(201);
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "dup@example.com", password: winnerPassword },
    });
    expect(login.statusCode).toBe(200);
  });
});
