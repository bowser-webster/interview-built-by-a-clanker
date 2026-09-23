import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// Auth is enforced unless explicitly disabled with ENFORCE_AUTH=false.
const ENFORCE_AUTH = process.env.ENFORCE_AUTH !== "false";

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!ENFORCE_AUTH) {
    return;
  }

  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: "Unauthorized" });
  }
}

export function registerAuthHook(app: FastifyInstance) {
  app.decorate("authenticate", authenticate);
}
