import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Persona } from "@acme/shared";
import { persona, renderApp, resetApp, stubApi } from "./renderApp";

const catalog: Persona[] = [
  persona({ id: "p-001", name: "Refactor Rex", specialty: "Engineering", price: 49.99 }),
  persona({ id: "p-002", name: "Sentinel Sam", specialty: "Security", price: 89.99 }),
  persona({ id: "p-003", name: "Audit Ava", specialty: "Security", price: 19.99 }),
  persona({ id: "p-004", name: "Pixel Pat", specialty: "Design", price: 29.99 }),
];

/** Stateful in-memory API that filters/sorts by the query string it receives. */
function stubCatalog() {
  return stubApi(({ method, path }) => {
    if (method !== "GET" || !path.startsWith("/personas")) return undefined;
    const params = new URL(path, "http://x").searchParams;
    let list = [...catalog];
    const q = params.get("q");
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    const specialty = params.get("specialty");
    if (specialty) list = list.filter((p) => p.specialty === specialty);
    if (params.get("sort") === "price-asc") list.sort((a, b) => a.price - b.price);
    return { body: list };
  });
}

function personaGetPaths(calls: { method: string; path: string }[]) {
  return calls.filter((c) => c.method === "GET" && c.path.startsWith("/personas")).map((c) => c.path);
}

function renderedNames() {
  return screen.getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent)
    .filter((t) => catalog.some((p) => p.name === t));
}

describe("browse page", () => {
  afterEach(resetApp);

  // H6: fails while queryKey is the static ["personas"] (no refetch on filter change).
  it("refetches with specialty=Security when the Security filter is clicked and shows only Security personas", async () => {
    const user = userEvent.setup();
    const { calls } = stubCatalog();
    renderApp("/");
    await screen.findByText("Refactor Rex");

    await user.click(screen.getByRole("button", { name: "Security" }));

    await waitFor(() => expect(personaGetPaths(calls)).toContain("/personas?specialty=Security"));
    await waitFor(() => expect(screen.queryByText("Refactor Rex")).toBeNull());
    expect(renderedNames().sort()).toEqual(["Audit Ava", "Sentinel Sam"]);
  });

  // H6: fails while queryKey is the static ["personas"] (sort change never refetches).
  it("refetches with sort=price-asc when sorting Price: Low to High and reorders the grid", async () => {
    const user = userEvent.setup();
    const { calls } = stubCatalog();
    renderApp("/");
    await screen.findByText("Refactor Rex");
    expect(renderedNames()).toEqual(["Refactor Rex", "Sentinel Sam", "Audit Ava", "Pixel Pat"]);

    await user.selectOptions(screen.getByRole("combobox"), "Price: Low to High");

    await waitFor(() => expect(personaGetPaths(calls)).toContain("/personas?sort=price-asc"));
    await waitFor(() =>
      expect(renderedNames()).toEqual(["Audit Ava", "Pixel Pat", "Refactor Rex", "Sentinel Sam"]),
    );
  });

  // H6: fails while queryKey is the static ["personas"] (debounced search never refetches).
  it("refetches with q=... after typing in the search box (debounced)", async () => {
    const user = userEvent.setup();
    const { calls } = stubCatalog();
    renderApp("/");
    await screen.findByText("Refactor Rex");

    await user.type(screen.getByPlaceholderText(/Search personas/), "pixel");

    await waitFor(() => expect(personaGetPaths(calls)).toContain("/personas?q=pixel"), {
      timeout: 2000,
    });
    await waitFor(() => expect(screen.queryByText("Refactor Rex")).toBeNull());
    expect(renderedNames()).toEqual(["Pixel Pat"]);
  });

  // H7: fails while PersonaCard renders (price * 100).toFixed(2).
  it("shows the card price as dollars, e.g. $49.99/mo, not $4999.00", async () => {
    stubApi(({ method, path }) =>
      method === "GET" && path.startsWith("/personas") ? { body: [persona({ price: 49.99 })] } : undefined,
    );
    renderApp("/");
    const name = await screen.findByText("Refactor Rex");
    const card = name.closest("a")!;
    const priceEl = within(card).getByText(
      (_, el) => el?.tagName === "P" && (el.textContent ?? "").endsWith("/mo"),
    );
    expect(priceEl.textContent).toBe("$49.99/mo");
    expect(card.textContent).not.toContain("4999.00");
  });
});
