import type { FastifyInstance } from "fastify";
import { personaFilterSchema } from "@acme/shared";
import { db } from "../db.js";

export async function personaRoutes(app: FastifyInstance) {
  app.get("/personas", async (request, reply) => {
    const parsed = personaFilterSchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const filters = parsed.data;
    if (
      filters.minPrice !== undefined &&
      filters.maxPrice !== undefined &&
      filters.minPrice > filters.maxPrice
    ) {
      return reply
        .status(400)
        .send({ error: "minPrice must be less than or equal to maxPrice" });
    }

    return db.personas.search(filters);
  });

  app.get<{ Params: { id: string } }>("/personas/:id", async (request, reply) => {
    const persona = db.personas.getById(request.params.id);
    if (!persona) {
      return reply.status(404).send({ error: "Persona not found" });
    }
    return persona;
  });
}
