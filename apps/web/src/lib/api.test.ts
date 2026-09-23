import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, setUnauthorizedHandler } from "./api";

function stubLocalStorage(token: string | null) {
  vi.stubGlobal("localStorage", {
    getItem: () => token,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => response,
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function captureError(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error("expected request to reject");
}

describe("api request error handling", () => {
  beforeEach(() => {
    stubLocalStorage(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("turns a zod flatten() validation error into a readable message", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          error: {
            formErrors: [],
            fieldErrors: {
              username: ["String must contain at least 3 character(s)"],
            },
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const err = await captureError(api.post("/api/auth/register", {}));

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toContain(
      "String must contain at least 3 character(s)",
    );
    expect(err.message).not.toContain("[object Object]");
  });

  it("keeps a string error message as-is", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "Email already registered" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const err = await captureError(api.post("/api/auth/register", {}));

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe("Email already registered");
  });

  it("falls back to a status message for a non-JSON body", async () => {
    stubFetch(new Response("Internal Server Error", { status: 500 }));

    const err = await captureError(api.get("/api/personas"));

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("Request failed: 500");
  });

  it("sends the stored token as a Bearer Authorization header", async () => {
    stubLocalStorage("tok-123");
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.get("/api/cart");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok-123");
  });
});

describe("api request headers (E1)", () => {
  beforeEach(() => {
    stubLocalStorage("tok-123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sentHeaders(fetchMock: ReturnType<typeof stubFetch>) {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return new Headers(init.headers);
  }

  // Fastify 5 rejects an empty body declared as JSON with 400 FST_ERR_CTP_EMPTY_JSON_BODY.
  it("sends no Content-Type on a bodyless DELETE", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await api.delete("/favorites/p-001");
    const headers = sentHeaders(fetchMock);
    expect(headers.has("content-type")).toBe(false);
    expect(headers.get("authorization")).toBe("Bearer tok-123");
  });

  it("sends no Content-Type on a bodyless GET", async () => {
    const fetchMock = stubFetch(new Response("[]", { status: 200 }));
    await api.get("/personas");
    expect(sentHeaders(fetchMock).has("content-type")).toBe(false);
  });

  it("still sends Content-Type: application/json when there is a JSON body", async () => {
    const fetchMock = stubFetch(new Response("{}", { status: 200 }));
    await api.post("/cart", { personaId: "p-001", quantity: 1 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ personaId: "p-001", quantity: 1 }));
  });
});


describe("api 401 notification (E3)", () => {
  beforeEach(() => {
    stubLocalStorage("tok-123");
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  const unauthorized = () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  it("reports the rejected token when an authenticated request gets a 401", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubFetch(unauthorized());
    await captureError(api.get("/cart"));
    expect(handler).toHaveBeenCalledWith("tok-123");
  });

  it("does not report a 401 from /auth/login or /auth/register (wrong credentials)", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubFetch(unauthorized());
    await captureError(api.post("/auth/login", {}));
    stubFetch(unauthorized());
    await captureError(api.post("/auth/register", {}));
    expect(handler).not.toHaveBeenCalled();
  });
});
