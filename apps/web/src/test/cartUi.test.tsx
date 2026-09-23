import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CartItem, Persona } from "@acme/shared";
import { persona, renderApp, resetApp, stubApi, testUser } from "./renderApp";

const rex = persona();
const ada = persona({ id: "p-002", name: "Architect Ada", price: 10 });
const personas: Record<string, Persona> = { [rex.id]: rex, [ada.id]: ada };

/** Stateful in-memory API: the cart lives in `lines` and mutations change it. */
function stubCartApi(initial: Array<{ personaId: string; quantity: number }>) {
  let lines: CartItem[] = initial.map((l, i) => ({
    id: `line-${i + 1}`,
    personaId: l.personaId,
    persona: personas[l.personaId]!,
    quantity: l.quantity,
  }));
  let nextId = lines.length + 1;
  const cart = () => ({
    items: lines,
    total: lines.reduce((s, l) => s + l.persona.price * l.quantity, 0),
  });

  return stubApi(({ method, path, body }) => {
    if (path === "/auth/me") return { body: testUser };
    if (path === "/favorites" && method === "GET") return { body: { favorites: [] } };
    if (method === "GET" && path.startsWith("/personas/")) {
      const p = personas[path.slice("/personas/".length)];
      return p ? { body: p } : undefined;
    }
    if (path === "/cart" && method === "GET") return { body: cart() };
    if (path === "/cart" && method === "POST") {
      const { personaId } = body as { personaId: string };
      const existing = lines.find((l) => l.personaId === personaId);
      if (existing) existing.quantity += 1;
      else
        lines.push({
          id: `line-${nextId++}`,
          personaId,
          persona: personas[personaId]!,
          quantity: 1,
        });
      return { status: 201, body: cart() };
    }
    const lineMatch = path.match(/^\/cart\/(.+)$/);
    if (lineMatch && method === "PUT") {
      const { quantity } = body as { quantity: number };
      if (quantity < 1) return { status: 400, body: { error: "quantity: min 1" } };
      lines = lines.map((l) => (l.id === lineMatch[1] ? { ...l, quantity } : l));
      return { body: cart() };
    }
    if (lineMatch && method === "DELETE") {
      lines = lines.filter((l) => l.id !== lineMatch[1]);
      return { body: cart() };
    }
    if (path === "/checkout" && method === "POST") {
      const order = {
        id: "order-1",
        userId: testUser.id,
        items: lines,
        total: cart().total,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        createdAt: new Date().toISOString(),
      };
      lines = [];
      return { status: 201, body: order };
    }
    return undefined;
  });
}

/** Text of the nav cart badge, or null when it is not rendered. */
function badgeText(container: HTMLElement): string | null {
  return container.querySelector('nav a[href="/cart"] span')?.textContent ?? null;
}

describe("nav cart badge (M6/E16)", () => {
  beforeEach(() => localStorage.setItem("auth_token", "tok"));
  afterEach(resetApp);

  it("updates after Add to Cart on the persona page without a reload", async () => {
    stubCartApi([{ personaId: "p-001", quantity: 1 }]);
    const { container } = renderApp("/personas/p-001");
    await waitFor(() => expect(badgeText(container)).toBe("1"));

    await userEvent.click(await screen.findByRole("button", { name: "Add to Cart" }));

    await waitFor(() => expect(badgeText(container)).toBe("2"));
  });

  it("updates after removing a line on the cart page", async () => {
    stubCartApi([
      { personaId: "p-001", quantity: 1 },
      { personaId: "p-002", quantity: 2 },
    ]);
    const { container } = renderApp("/cart");
    await waitFor(() => expect(badgeText(container)).toBe("3"));

    const removes = await screen.findAllByRole("button", { name: "Remove" });
    await userEvent.click(removes[1]!);

    await waitFor(() => expect(badgeText(container)).toBe("1"));
  });

  it("disappears after placing an order on the checkout page", async () => {
    stubCartApi([{ personaId: "p-001", quantity: 1 }]);
    const { container } = renderApp("/checkout");
    await waitFor(() => expect(badgeText(container)).toBe("1"));

    await userEvent.type(await screen.findByLabelText("Full Name"), "Jane Doe");
    await userEvent.type(screen.getByLabelText("Email"), "jane@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Place Order" }));

    expect(await screen.findByText("Order Confirmed!")).toBeTruthy();
    await waitFor(() => expect(badgeText(container)).toBeNull());
  });
});

describe("cart line quantity controls (M9)", () => {
  beforeEach(() => localStorage.setItem("auth_token", "tok"));
  afterEach(resetApp);

  it("disables '-' at quantity 1 and sends no PUT when it is clicked", async () => {
    const { calls } = stubCartApi([{ personaId: "p-001", quantity: 1 }]);
    renderApp("/cart");

    const minus = await screen.findByRole("button", { name: "-" });
    expect((minus as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(minus);
    // Give any (buggy) mutation a chance to fire before asserting its absence.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  // Regression guard: passes before and after the fix.
  it("at quantity 2, '-' sends PUT {quantity: 1}", async () => {
    const { calls } = stubCartApi([{ personaId: "p-001", quantity: 2 }]);
    renderApp("/cart");

    const minus = await screen.findByRole("button", { name: "-" });
    expect((minus as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(minus);

    await waitFor(() =>
      expect(calls.filter((c) => c.method === "PUT")).toMatchObject([
        { path: "/cart/line-1", body: { quantity: 1 } },
      ]),
    );
  });
});
