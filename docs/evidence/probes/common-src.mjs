export const APP_URL = "../../../apps/api/src/app.ts";
export async function fresh(tag = Date.now()) {
  const { buildApp } = await import(`${APP_URL}?v=${tag}`);
  return buildApp();
}
export async function register(app, email = `u${Math.random().toString(36).slice(2)}@x.io`, password = "password123", username = "user1") {
  const r = await app.inject({ method: "POST", url: "/auth/register", payload: { username, email, password } });
  return { status: r.statusCode, body: r.json(), email, password };
}
export const auth = (t) => ({ authorization: `Bearer ${t}` });
