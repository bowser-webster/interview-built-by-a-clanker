import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Persona } from "@acme/shared";
import { freshApp, registerUser, bearer } from "./helpers.js";

describe("POST /favorites body validation (M4)", () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    app = await freshApp();
    ({ token } = await registerUser(app));
  });
  afterEach(async () => app?.close());

  it("rejects a request with no body with 400 instead of crashing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/favorites",
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error");
  });

  it("rejects a JSON null body with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/favorites",
      headers: { ...bearer(token), "content-type": "application/json" },
      payload: "null",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error");
  });

  it("rejects a non-string personaId with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/favorites",
      headers: bearer(token),
      payload: { personaId: 123 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an empty object with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/favorites",
      headers: bearer(token),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("adds a valid persona and lists it in GET /favorites", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/favorites",
      headers: bearer(token),
      payload: { personaId: "p-002" },
    });
    expect(res.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/favorites", headers: bearer(token) });
    expect(list.statusCode).toBe(200);
    const { favorites } = list.json() as { favorites: Persona[] };
    expect(favorites.map((p) => p.id)).toContain("p-002");
  });

  it("returns 404 for an unknown persona id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/favorites",
      headers: bearer(token),
      payload: { personaId: "p-999" },
    });
    expect(res.statusCode).toBe(404);
  });
});
