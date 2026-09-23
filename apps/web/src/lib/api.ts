const API_BASE = "http://localhost:3001";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

/**
 * Called when a request that carried a token gets a 401, with the token that
 * was rejected. AuthProvider registers this to end the session.
 */
type UnauthorizedHandler = (rejectedToken: string) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

// A 401 from these means "wrong credentials", not "your session expired".
const CREDENTIAL_PATHS = new Set(["/auth/login", "/auth/register"]);

/**
 * Turn an API `error` field into readable text. Handles plain strings and
 * zod `flatten()` objects ({ formErrors, fieldErrors }); returns undefined
 * for anything else so the caller can fall back to a status message.
 */
function errorMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error || undefined;
  if (!error || typeof error !== "object") return undefined;

  const { formErrors, fieldErrors } = error as {
    formErrors?: unknown;
    fieldErrors?: unknown;
  };
  const parts: string[] = [];

  if (Array.isArray(formErrors)) {
    parts.push(...formErrors.filter((m): m is string => typeof m === "string"));
  }
  if (fieldErrors && typeof fieldErrors === "object") {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        if (typeof m === "string") parts.push(`${field}: ${m}`);
      }
    }
  }

  return parts.length > 0 ? parts.join("; ") : undefined;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  // Only declare JSON when there is a body: Fastify rejects an empty body sent
  // as application/json, which broke every DELETE.
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && token && !CREDENTIAL_PATHS.has(path)) {
    unauthorizedHandler?.(token);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorMessage(body?.error) ?? `Request failed: ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { ApiError };
