import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { userSchema } from "@acme/shared";
import { freshApp, registerUser, bearer } from "./helpers.js";

const LEGACY_SECRET = "agentic-personas-dev-secret";

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** Hand-signs an HS256 JWT, the way an attacker with a known secret would. */
function forgeToken(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

// Env vars this file manipulates; restored after every test so nothing leaks.
const savedEnv = {
  ENFORCE_AUTH: process.env.ENFORCE_AUTH,
  JWT_SECRET: process.env.JWT_SECRET,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("auth", () => {
  const apps: FastifyInstance[] = [];
  async function boot(): Promise<FastifyInstance> {
    const app = await freshApp();
    apps.push(app);
    return app;
  }

  beforeEach(() => {
    delete process.env.JWT_SECRET;
  });

  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
    restoreEnv();
  });

  describe("C1: auth is enforced by default (ENFORCE_AUTH unset)", () => {
    beforeEach(() => {
      delete process.env.ENFORCE_AUTH;
    });

    it("accepts a valid token on GET /cart and GET /auth/me", async () => {
      const app = await boot();
      const user = await registerUser(app);

      const cart = await app.inject({ method: "GET", url: "/cart", headers: bearer(user.token) });
      expect(cart.statusCode).toBe(200);

      const me = await app.inject({ method: "GET", url: "/auth/me", headers: bearer(user.token) });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ id: user.id, email: user.email });
    });

    it.each([
      ["GET", "/cart"],
      ["POST", "/cart"],
      ["PUT", "/cart/cart-1"],
      ["DELETE", "/cart/cart-1"],
      ["GET", "/favorites"],
      ["POST", "/favorites"],
      ["DELETE", "/favorites/persona-1"],
      ["POST", "/checkout"],
      ["GET", "/auth/me"],
    ] as const)("returns 401 (never 500) for %s %s without a token", async (method, url) => {
      const app = await boot();
      const res = await app.inject({ method, url, payload: method === "GET" || method === "DELETE" ? undefined : {} });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("C3: tokens cannot be forged and expire", () => {
    it("rejects a token hand-signed with the old hard-coded secret", async () => {
      const app = await boot();
      const user = await registerUser(app);
      const forged = forgeToken(
        { id: user.id, email: user.email, iat: Math.floor(Date.now() / 1000) },
        LEGACY_SECRET,
      );

      const res = await app.inject({ method: "GET", url: "/auth/me", headers: bearer(forged) });
      expect(res.statusCode).toBe(401);
    });

    it("issues tokens that carry an exp claim", async () => {
      const app = await boot();
      const user = await registerUser(app);
      const payload = decodePayload(user.token);
      expect(typeof payload.exp).toBe("number");
      expect(payload.exp as number).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe("M2: tokens do not survive a restart onto another user", () => {
    it("rejects a token issued by a previous instance (per-boot secret)", async () => {
      const first = await boot();
      const user = await registerUser(first);

      const second = await boot();
      const res = await second.inject({ method: "GET", url: "/auth/me", headers: bearer(user.token) });
      expect(res.statusCode).toBe(401);
    });

    it("does not resolve an old token to a different user even with a shared JWT_SECRET", async () => {
      process.env.JWT_SECRET = "fixed-test-secret-for-m2";

      const first = await boot();
      const alice = await registerUser(first, { username: "alice", email: "alice@example.com" });

      const second = await boot();
      const bob = await registerUser(second, { username: "bobby", email: "bob@example.com" });

      const res = await second.inject({ method: "GET", url: "/auth/me", headers: bearer(alice.token) });
      expect(res.statusCode === 404 || res.statusCode === 401).toBe(true);
      expect(res.body).not.toContain(bob.email);
    });
  });

  describe("H4: passwords are salted and collision-resistant", () => {
    it("rejects a colliding wrong password and accepts the right one", async () => {
      const app = await boot();
      const user = await registerUser(app, { password: "AaAaAa" });

      const wrong = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: user.email, password: "BBBBBB" },
      });
      expect(wrong.statusCode).toBe(401);

      const right = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: user.email, password: "AaAaAa" },
      });
      expect(right.statusCode).toBe(200);
    });

    it("stores different hashes for two users with the same password", async () => {
      const app = await boot();
      const a = await registerUser(app, { password: "samepass1" });
      const b = await registerUser(app, { password: "samepass1" });

      // Same module registry as the app freshApp just built.
      const { db } = await import("../src/db.js");
      const hashA = db.users.getByEmail(a.email)!.passwordHash;
      const hashB = db.users.getByEmail(b.email)!.passwordHash;
      expect(hashA).not.toBe(hashB);
      expect(hashA).not.toContain("samepass1");
    });
  });

  describe("M1: login response matches AuthResponse", () => {
    it("returns the same user shape as register, including username", async () => {
      const app = await boot();
      const reg = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { username: "carolxx", email: "carol@example.com", password: "secret123" },
      });
      expect(reg.statusCode).toBe(201);

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "carol@example.com", password: "secret123" },
      });
      expect(login.statusCode).toBe(200);
      const loginUser = login.json().user;
      expect(() => userSchema.parse(loginUser)).not.toThrow();
      expect(loginUser).toEqual(reg.json().user);
    });
  });
});
