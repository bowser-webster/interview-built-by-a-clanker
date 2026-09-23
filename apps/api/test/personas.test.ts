import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Persona } from "@acme/shared";
import { freshApp } from "./helpers.js";

async function getPersonas(app: FastifyInstance, qs: string) {
  const res = await app.inject({ method: "GET", url: `/personas${qs}` });
  return res;
}

describe("GET /personas price filters (H2)", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await freshApp();
  });
  afterEach(async () => app?.close());

  it("minPrice returns only personas priced at or above it", async () => {
    const res = await getPersonas(app, "?minPrice=50");
    expect(res.statusCode).toBe(200);
    const list = res.json() as Persona[];
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) expect(p.price).toBeGreaterThanOrEqual(50);
  });

  it("minPrice=50 and maxPrice=49.99 are disjoint and together cover all 15 personas", async () => {
    const above = (await getPersonas(app, "?minPrice=50")).json() as Persona[];
    const below = (await getPersonas(app, "?maxPrice=49.99")).json() as Persona[];
    const aboveIds = new Set(above.map((p) => p.id));
    const belowIds = new Set(below.map((p) => p.id));
    const overlap = [...aboveIds].filter((id) => belowIds.has(id));
    expect(overlap).toEqual([]);
    expect(new Set([...aboveIds, ...belowIds]).size).toBe(15);
  });

  it("minPrice is inclusive at the boundary", async () => {
    const list = (await getPersonas(app, "?minPrice=49.99")).json() as Persona[];
    const rex = list.find((p) => p.id === "p-001");
    expect(rex?.price).toBe(49.99);
    for (const p of list) expect(p.price).toBeGreaterThanOrEqual(49.99);
  });

  it("minPrice and maxPrice together return exactly the personas in range", async () => {
    const res = await getPersonas(app, "?minPrice=50&maxPrice=60");
    expect(res.statusCode).toBe(200);
    const list = res.json() as Persona[];
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(p.price).toBeGreaterThanOrEqual(50);
      expect(p.price).toBeLessThanOrEqual(60);
    }
    expect(list.map((p) => p.id).sort()).toEqual(["p-003", "p-004", "p-007", "p-013"]);
  });
});

describe("GET /personas query validation (M3)", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await freshApp();
  });
  afterEach(async () => app?.close());

  it("rejects a repeated q param with 400 instead of crashing", async () => {
    const res = await getPersonas(app, "?q=rex&q=data");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error");
  });

  it("rejects a non-numeric maxPrice with 400", async () => {
    const res = await getPersonas(app, "?maxPrice=abc");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error");
  });

  it("rejects an unknown sort with 400", async () => {
    const res = await getPersonas(app, "?sort=bogus");
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown specialty with 400", async () => {
    const res = await getPersonas(app, "?specialty=Astrology");
    expect(res.statusCode).toBe(400);
  });

  it("rejects minPrice greater than maxPrice with 400", async () => {
    const res = await getPersonas(app, "?minPrice=100&maxPrice=10");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error");
  });

  it("still serves valid filter + sort combinations", async () => {
    const res = await getPersonas(app, "?specialty=Security&sort=price-asc");
    expect(res.statusCode).toBe(200);
    const list = res.json() as Persona[];
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) expect(p.specialty).toBe("Security");
    const prices = list.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("returns all 15 personas with no params", async () => {
    const res = await getPersonas(app, "");
    expect(res.statusCode).toBe(200);
    expect((res.json() as Persona[]).length).toBe(15);
  });
});
