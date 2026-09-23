import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { persona, renderApp, resetApp, stubApi, testUser } from "./renderApp";

/** Signed-in API stub whose /favorites endpoints keep real state. */
function statefulFavoritesApi(initial: string[]) {
  const favs = new Set(initial);
  const rex = persona();
  return stubApi(({ method, path, body }) => {
    if (path === "/auth/me") return { body: testUser };
    if (path === "/cart") return { body: { items: [], total: 0 } };
    if (method === "GET" && path === "/personas/p-001") return { body: rex };
    if (method === "GET" && path === "/favorites") {
      return { body: { favorites: favs.has(rex.id) ? [rex] : [] } };
    }
    if (method === "POST" && path === "/favorites") {
      const { personaId } = body as { personaId: string };
      favs.add(personaId);
      return { status: 201, body: { success: true } };
    }
    if (method === "DELETE" && path.startsWith("/favorites/")) {
      const id = path.slice("/favorites/".length);
      if (!favs.delete(id)) return { status: 404, body: { error: "Favorite not found" } };
      return { body: { success: true } };
    }
    return undefined;
  });
}

/** The heart is the button next to "Add to Cart". */
async function findHeart(): Promise<HTMLButtonElement> {
  const addToCart = await screen.findByRole("button", { name: "Add to Cart" });
  const buttons = addToCart.parentElement!.querySelectorAll("button");
  return buttons[1] as HTMLButtonElement;
}

function isFilled(heart: HTMLButtonElement): boolean {
  return heart.querySelector("svg")!.getAttribute("fill") === "currentColor";
}

describe("persona detail favorite toggle (H5)", () => {
  afterEach(resetApp);

  it("clicking an empty heart POSTs /favorites and the heart fills", async () => {
    // Fails if the toggle sends DELETE when the persona is not favorited.
    localStorage.setItem("auth_token", "tok");
    const { calls } = statefulFavoritesApi([]);
    renderApp("/personas/p-001");

    const heart = await findHeart();
    await waitFor(() =>
      expect(calls.some((c) => c.method === "GET" && c.path === "/favorites")).toBe(true),
    );
    expect(isFilled(heart)).toBe(false);

    await userEvent.click(heart);

    await waitFor(() => expect(isFilled(heart)).toBe(true));
    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes).toEqual([
      expect.objectContaining({ method: "POST", path: "/favorites", body: { personaId: "p-001" } }),
    ]);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("clicking a filled heart DELETEs /favorites/p-001 and the heart empties", async () => {
    // Fails if the toggle POSTs when the persona is already favorited.
    localStorage.setItem("auth_token", "tok");
    const { calls } = statefulFavoritesApi(["p-001"]);
    renderApp("/personas/p-001");

    const heart = await findHeart();
    await waitFor(() => expect(isFilled(heart)).toBe(true));

    await userEvent.click(heart);

    await waitFor(() => expect(isFilled(heart)).toBe(false));
    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes).toEqual([
      expect.objectContaining({ method: "DELETE", path: "/favorites/p-001" }),
    ]);
  });
});
