import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshApp, registerUser, bearer } from "./helpers.js";

type CartBody = {
  items: { id: string; personaId: string; quantity: number }[];
  total: number;
};

type OrderBody = {
  id: string;
  userId: string;
  items: { personaId: string; quantity: number }[];
  total: number;
};

const customer = { name: "Alice Example", email: "alice@example.com" };

async function addItem(app: FastifyInstance, token: string, personaId: string, quantity: number) {
  const res = await app.inject({
    method: "POST",
    url: "/cart",
    headers: bearer(token),
    payload: { personaId, quantity },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as CartBody;
}

async function getCart(app: FastifyInstance, token: string): Promise<CartBody> {
  const res = await app.inject({ method: "GET", url: "/cart", headers: bearer(token) });
  expect(res.statusCode).toBe(200);
  return res.json() as CartBody;
}

async function checkout(app: FastifyInstance, token: string) {
  return app.inject({
    method: "POST",
    url: "/checkout",
    headers: bearer(token),
    payload: customer,
  });
}

describe("POST /checkout clears the cart (H3)", () => {
  let app: FastifyInstance;
  let alice: Awaited<ReturnType<typeof registerUser>>;
  let bob: Awaited<ReturnType<typeof registerUser>>;

  beforeEach(async () => {
    app = await freshApp();
    alice = await registerUser(app);
    bob = await registerUser(app);
  });

  it("empties the user's cart after a successful checkout", async () => {
    await addItem(app, alice.token, "p-001", 2);

    const res = await checkout(app, alice.token);
    expect(res.statusCode).toBe(201);

    expect(await getCart(app, alice.token)).toEqual({ items: [], total: 0 });
  });

  it("rejects a second checkout with 400 Cart is empty", async () => {
    await addItem(app, alice.token, "p-001", 1);

    expect((await checkout(app, alice.token)).statusCode).toBe(201);

    const second = await checkout(app, alice.token);
    expect(second.statusCode).toBe(400);
    expect(second.json()).toEqual({ error: "Cart is empty" });
  });

  it("returns an order that snapshots the cart's items, quantities and total", async () => {
    await addItem(app, alice.token, "p-001", 2);
    const cartBefore = await addItem(app, alice.token, "p-002", 3);

    const res = await checkout(app, alice.token);
    expect(res.statusCode).toBe(201);
    const order = res.json() as OrderBody;

    expect(order.userId).toBe(alice.id);
    expect(order.total).toBe(cartBefore.total);
    expect(order.items.map((i) => ({ personaId: i.personaId, quantity: i.quantity }))).toEqual(
      cartBefore.items.map((i) => ({ personaId: i.personaId, quantity: i.quantity })),
    );
    expect(order.items).toHaveLength(2);
  });

  it("does not touch another user's cart", async () => {
    await addItem(app, alice.token, "p-001", 1);
    const bobCartBefore = await addItem(app, bob.token, "p-002", 4);

    expect((await checkout(app, alice.token)).statusCode).toBe(201);

    expect(await getCart(app, bob.token)).toEqual(bobCartBefore);
  });
});
