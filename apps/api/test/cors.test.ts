import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshApp } from "./helpers.js";

describe("H1: CORS preflight", () => {
  let app: FastifyInstance;
  afterEach(async () => app?.close());

  it("allows every method the web client uses, including DELETE", async () => {
    app = await freshApp();
    const res = await app.inject({
      method: "OPTIONS",
      url: "/cart/cart-1",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "DELETE",
      },
    });

    expect(res.statusCode).toBeLessThan(300);
    const allowed = String(res.headers["access-control-allow-methods"] ?? "")
      .split(",")
      .map((m) => m.trim().toUpperCase());
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      expect(allowed).toContain(method);
    }
  });
});
