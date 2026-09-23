import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { persona, renderApp, resetApp, stubApi, testUser } from "./renderApp";

describe("web test harness", () => {
  afterEach(resetApp);

  it("renders the browse page from the real route tree with a stubbed API", async () => {
    stubApi(({ method, path }) =>
      method === "GET" && path.startsWith("/personas") ? { body: [persona()] } : undefined,
    );
    renderApp("/");
    expect(await screen.findByText("Refactor Rex")).toBeTruthy();
  });

  it("starts signed in when a token is stored and /auth/me succeeds", async () => {
    localStorage.setItem("auth_token", "tok");
    stubApi(({ path }) => {
      if (path === "/auth/me") return { body: testUser };
      if (path === "/cart") return { body: { items: [], total: 0 } };
      if (path.startsWith("/personas")) return { body: [] };
      return undefined;
    });
    renderApp("/");
    expect(await screen.findByText("alice")).toBeTruthy();
  });
});
