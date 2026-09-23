import { render, cleanup, type RenderResult } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  type AnyRouter,
  type RouterHistory,
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { vi } from "vitest";
import type { Persona } from "@acme/shared";
import { AuthProvider } from "~/lib/auth";
import { queryClient } from "~/lib/queryClient";
import { routeTree } from "~/routeTree.gen";

export interface ApiCall {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

export type ApiHandler = (call: ApiCall) => { status?: number; body?: unknown } | undefined;

/**
 * Replaces global fetch with an in-memory API. The handler returns
 * { status, body } for a call, or undefined for a 404. Every call is recorded.
 */
export function stubApi(handler: ApiHandler) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const call: ApiCall = {
      method: (init.method ?? "GET").toUpperCase(),
      path: url.pathname + url.search,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const result = handler(call) ?? { status: 404, body: { error: "Not found" } };
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

/**
 * Renders the real app (real route tree, real AuthProvider, the app's shared
 * queryClient) at `path` using in-memory history. Seed a token first with
 * `localStorage.setItem("auth_token", ...)` to start signed in.
 */
export function renderApp(
  path: string,
): RenderResult & { router: AnyRouter; history: RouterHistory } {
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreloadStaleTime: 0,
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router, history };
}

/** Resets state shared across tests: DOM, query cache, storage, globals. */
export function resetApp() {
  cleanup();
  queryClient.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
}

export const testUser = { id: "user-1", username: "alice", email: "alice@example.com" };

export function persona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "p-001",
    name: "Refactor Rex",
    tagline: "Your relentless code reviewer",
    description: "Reviews code.",
    avatarUrl: "https://example.com/rex.svg",
    specialty: "Engineering",
    capabilities: ["Code review"],
    price: 49.99,
    rating: 4.8,
    reviewCount: 234,
    tier: "Pro",
    ...overrides,
  };
}
