import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshApp, registerUser, bearer } from "./helpers.js";

type CartBody = {
  items: { id: string; personaId: string; quantity: number }[];
  total: number;
};

async function addItem(
  app: FastifyInstance,
  token: string,
  personaId: string,
  quantity: unknown,
) {
  return app.inject({
    method: "POST",
    url: "/cart",
    headers: bearer(token),
    payload: { personaId, quantity },
  });
}

async function getCart(app: FastifyInstance, token: string): Promise<CartBody> {
  const res = await app.inject({ method: "GET", url: "/cart", headers: bearer(token) });
  expect(res.statusCode).toBe(200);
  return res.json() as CartBody;
}

describe("DELETE /cart/:itemId ownership (C2)", () => {
  let app: FastifyInstance;
  let alice: Awaited<ReturnType<typeof registerUser>>;
  let bob: Awaited<ReturnType<typeof registerUser>>;

  beforeEach(async () => {
    app = await freshApp();
    alice = await registerUser(app);
    bob = await registerUser(app);
  });

  it("returns 404 when a user deletes another user's cart item, and the owner's item survives", async () => {
    const added = await addItem(app, alice.token, "p-001", 3);
    expect(added.statusCode).toBe(200);
    const aliceItem = (added.json() as CartBody).items[0];

    const res = await app.inject({
      method: "DELETE",
      url: `/cart/${aliceItem.id}`,
      headers: bearer(bob.token),
    });
    expect(res.statusCode).toBe(404);

    const aliceCart = await getCart(app, alice.token);
    expect(aliceCart.items).toEqual([
      expect.objectContaining({ id: aliceItem.id, personaId: "p-001", quantity: 3 }),
    ]);
  });

  it("lets a user delete their own cart item", async () => {
    const added = await addItem(app, alice.token, "p-001", 2);
    const aliceItem = (added.json() as CartBody).items[0];

    const res = await app.inject({
      method: "DELETE",
      url: `/cart/${aliceItem.id}`,
      headers: bearer(alice.token),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as CartBody).items).toEqual([]);

    const aliceCart = await getCart(app, alice.token);
    expect(aliceCart.items.find((i) => i.id === aliceItem.id)).toBeUndefined();
  });

  it("returns 404 for a nonexistent cart item id", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/cart/cart-9999",
      headers: bearer(alice.token),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("cart quantity bounds (M5)", () => {
  let app: FastifyInstance;
  let alice: Awaited<ReturnType<typeof registerUser>>;

  beforeEach(async () => {
    app = await freshApp();
    alice = await registerUser(app);
  });

  it("rejects POST quantity 1e308 with 400 and keeps the total finite", async () => {
    const res = await addItem(app, alice.token, "p-001", 1e308);
    expect(res.statusCode).toBe(400);
    const cart = await getCart(app, alice.token);
    expect(Number.isFinite(cart.total)).toBe(true);
  });

  it("rejects POST quantity 100 with 400", async () => {
    const res = await addItem(app, alice.token, "p-001", 100);
    expect(res.statusCode).toBe(400);
  });

  it("accepts POST quantity 99", async () => {
    const res = await addItem(app, alice.token, "p-001", 99);
    expect(res.statusCode).toBe(200);
    const body = res.json() as CartBody;
    expect(body.items[0].quantity).toBe(99);
    expect(Number.isFinite(body.total)).toBe(true);
  });

  it("rejects a POST that would merge the existing line past 99, leaving the line unchanged", async () => {
    const first = await addItem(app, alice.token, "p-001", 60);
    expect(first.statusCode).toBe(200);

    const second = await addItem(app, alice.token, "p-001", 60);
    expect(second.statusCode).toBe(400);

    const cart = await getCart(app, alice.token);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(60);
    expect(Number.isFinite(cart.total)).toBe(true);
  });

  it("rejects PUT quantity 100 with 400 and leaves the line unchanged", async () => {
    const added = await addItem(app, alice.token, "p-001", 5);
    const item = (added.json() as CartBody).items[0];

    const res = await app.inject({
      method: "PUT",
      url: `/cart/${item.id}`,
      headers: bearer(alice.token),
      payload: { quantity: 100 },
    });
    expect(res.statusCode).toBe(400);

    const cart = await getCart(app, alice.token);
    expect(cart.items[0].quantity).toBe(5);
  });
});
