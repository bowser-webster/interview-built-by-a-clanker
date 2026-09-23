import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Cart } from "@acme/shared";
import { persona, renderApp, resetApp, stubApi, testUser, type ApiCall } from "./renderApp";

const userB = { id: "user-2", username: "bob", email: "bob@example.com" };

function cartOf(name: string, id: string): Cart {
  const p = persona({ id, name });
  return { items: [{ id: `item-${id}`, personaId: id, persona: p, quantity: 1 }], total: p.price };
}

const CART_A = cartOf("Alice Persona", "p-a");
const CART_B = cartOf("Bob Persona", "p-b");

function bearer(call: ApiCall): string | null {
  return call.headers.get("authorization");
}

/** Two-user API: tokens tok-a (alice) and tok-b (bob), each with its own cart. */
function twoUserApi() {
  return stubApi((call) => {
    const auth = bearer(call);
    const who = auth === "Bearer tok-a" ? "a" : auth === "Bearer tok-b" ? "b" : null;
    if (call.method === "POST" && call.path === "/auth/login") {
      return { body: { token: "tok-b", user: userB } };
    }
    if (call.path.startsWith("/personas")) return { body: [] };
    if (!who) return { status: 401, body: { error: "Unauthorized" } };
    if (call.path === "/auth/me") return { body: who === "a" ? testUser : userB };
    if (call.path === "/cart") return { body: who === "a" ? CART_A : CART_B };
    if (call.path === "/favorites") return { body: { favorites: [] } };
    return undefined;
  });
}

async function signInAsBobViaForm() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email"), "bob@example.com");
  await user.type(screen.getByLabelText("Password"), "hunter22");
  await user.click(screen.getByRole("button", { name: "Sign In" }));
}

describe("H9: sign out ends the session", () => {
  afterEach(resetApp);

  it("removes the stored token when the user clicks Sign out", async () => {
    // Fails if logout() does not call localStorage.removeItem("auth_token").
    localStorage.setItem("auth_token", "tok-a");
    twoUserApi();
    renderApp("/");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await screen.findByText("Sign in");
    expect(localStorage.getItem("auth_token")).toBeNull();
  });

  it("stays signed out after a reload and sends no Authorization header afterwards", async () => {
    // Fails if the token survives sign-out: a fresh mount reads it, calls
    // /auth/me with the old Bearer token, and shows the user again.
    localStorage.setItem("auth_token", "tok-a");
    const { calls } = twoUserApi();
    renderApp("/");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await screen.findByText("Sign in");
    const afterSignOut = calls.length;

    // "Reload": unmount and mount a fresh app.
    cleanup();
    renderApp("/");
    expect(await screen.findByText("Sign in")).toBeTruthy();
    // Give any /auth/me round-trip time to land before asserting absence.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("alice")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();

    const later = calls.slice(afterSignOut);
    expect(later.filter((c) => bearer(c) !== null).map((c) => `${c.method} ${c.path} ${bearer(c)}`)).toEqual([]);
  });

  it("does not show user A's cached cart to user B who signs in after A signs out", async () => {
    // Fails if logout() leaves the query cache: B's /cart renders A's fresh
    // (staleTime 60s) cached cart instead of fetching B's.
    localStorage.setItem("auth_token", "tok-a");
    twoUserApi();
    const { router } = renderApp("/cart");
    expect(await screen.findAllByText("Alice Persona")).not.toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText("Sign in");
    await router.navigate({ to: "/login" });
    await signInAsBobViaForm();
    await screen.findByText("bob");

    await router.navigate({ to: "/cart" });
    expect(await screen.findAllByText("Bob Persona")).not.toHaveLength(0);
    expect(screen.queryByText("Alice Persona")).toBeNull();
  });

  it("does not show the previous user's cached cart when a new user signs in without signing out", async () => {
    // Fails if login() does not clear the query cache (A's cart is still fresh).
    localStorage.setItem("auth_token", "tok-a");
    twoUserApi();
    const { router } = renderApp("/cart");
    expect(await screen.findAllByText("Alice Persona")).not.toHaveLength(0);

    await router.navigate({ to: "/login" });
    await signInAsBobViaForm();
    await screen.findByText("bob");

    await router.navigate({ to: "/cart" });
    expect(await screen.findAllByText("Bob Persona")).not.toHaveLength(0);
    expect(screen.queryByText("Alice Persona")).toBeNull();
  });
});

describe("E3: a 401 during a session ends it", () => {
  afterEach(resetApp);

  it("shows the signed-out state when GET /cart returns 401 (expired token)", async () => {
    // Fails if nothing reacts to a 401 on an authenticated request: the page
    // shows "Your cart is empty" and the nav keeps the username.
    localStorage.setItem("auth_token", "tok");
    const { calls } = stubApi(({ path }) => {
      if (path === "/auth/me") return { body: testUser };
      if (path === "/cart") return { status: 401, body: { error: "Unauthorized" } };
      if (path.startsWith("/personas")) return { body: [] };
      return undefined;
    });
    renderApp("/cart");

    // The page renders signed-out before /auth/me resolves, so first wait for
    // the signed-in /cart request, then for the session to end.
    await waitFor(() => expect(calls.some((c) => c.path === "/cart")).toBe(true));
    await waitFor(() => expect(localStorage.getItem("auth_token")).toBeNull());
    expect(await screen.findByText("Sign in to view your cart")).toBeTruthy();
    expect(screen.queryByText("alice")).toBeNull();
    expect(screen.queryByText("Your cart is empty")).toBeNull();
  });

  it("keeps the session when POST /auth/login returns 401 (wrong password) [regression guard]", async () => {
    // Regression guard (passes before the fix): fails if the 401 handler treats a
    // credential rejection on /auth/login as the current session expiring.
    localStorage.setItem("auth_token", "tok");
    stubApi(({ method, path }) => {
      if (path === "/auth/me") return { body: testUser };
      if (path === "/cart") return { body: { items: [], total: 0 } };
      if (method === "POST" && path === "/auth/login") {
        return { status: 401, body: { error: "Invalid email or password" } };
      }
      return undefined;
    });
    renderApp("/login");
    await screen.findByText("alice");

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Invalid email or password")).toBeTruthy();
    expect(localStorage.getItem("auth_token")).toBe("tok");
    expect(screen.getByText("alice")).toBeTruthy();
  });

  it("a stale /auth/me 401 for an old token does not wipe a token stored after it started (L5)", async () => {
    // Fails if the /auth/me 401 path removes whatever token is currently stored
    // instead of only the token that was rejected.
    localStorage.setItem("auth_token", "tok-old");
    let releaseMe!: () => void;
    const meGate = new Promise<void>((r) => (releaseMe = r));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = new URL(String(input)).pathname;
      const auth = new Headers(init.headers).get("authorization");
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (path === "/auth/me" && auth === "Bearer tok-old") {
        await meGate;
        return json(401, { error: "Unauthorized" });
      }
      if (path === "/auth/me" && auth === "Bearer tok-b") return json(200, userB);
      if (path === "/auth/login") return json(200, { token: "tok-b", user: userB });
      if (path === "/cart") return json(200, { items: [], total: 0 });
      return json(404, { error: "Not found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/login");
    await signInAsBobViaForm();
    await screen.findByText("bob");
    expect(localStorage.getItem("auth_token")).toBe("tok-b");

    releaseMe();
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => expect(localStorage.getItem("auth_token")).toBe("tok-b"));
    expect(screen.getByText("bob")).toBeTruthy();
  });
});
