import { afterEach, describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { persona, renderApp, resetApp, stubApi, testUser } from "./renderApp";

/** Signed-in API where p-001 is already a favorite. */
function signedInWithOneFavorite() {
  const rex = persona();
  localStorage.setItem("auth_token", "tok");
  return stubApi(({ method, path }) => {
    if (path === "/auth/me") return { body: testUser };
    if (path === "/cart") return { body: { items: [], total: 0 } };
    if (method === "GET" && path === "/personas/p-001") return { body: rex };
    if (method === "GET" && path === "/favorites") return { body: { favorites: [rex] } };
    return undefined;
  });
}

function heartIsFilled(): boolean {
  const addToCart = screen.getByRole("button", { name: "Add to Cart" });
  const heart = addToCart.parentElement!.querySelectorAll("button")[1]!;
  return heart.querySelector("svg")!.getAttribute("fill") === "currentColor";
}

describe("favorites cache shared between /favorites and persona detail (H8)", () => {
  afterEach(resetApp);

  it("/favorites then persona detail: detail renders and shows the heart as favorited", async () => {
    // Fails if the detail page reads the ["favorites"] cache as string[] while
    // /favorites stored { favorites: Persona[] } (favorites.includes is not a function).
    signedInWithOneFavorite();
    renderApp("/favorites");

    const cardName = await screen.findByText("Refactor Rex");
    await userEvent.click(cardName);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Refactor Rex" }),
    ).toBeTruthy();
    await waitFor(() => expect(heartIsFilled()).toBe(true));
    expect(screen.queryByText(/is not a function/)).toBeNull();
  });

  it("persona detail then /favorites: the favorite is listed, not the empty message", async () => {
    // Fails if the detail page cached a string[] under ["favorites"], which
    // /favorites then reads as { favorites } and finds nothing.
    signedInWithOneFavorite();
    const { router } = renderApp("/personas/p-001");

    await screen.findByRole("heading", { level: 1, name: "Refactor Rex" });
    await waitFor(() => expect(heartIsFilled()).toBe(true));

    await act(() => router.navigate({ to: "/favorites" }));

    expect(await screen.findByRole("heading", { name: "Your Favorites" })).toBeTruthy();
    expect(await screen.findByText("Refactor Rex")).toBeTruthy();
    expect(screen.queryByText("You haven't favorited any personas yet.")).toBeNull();
  });
});
