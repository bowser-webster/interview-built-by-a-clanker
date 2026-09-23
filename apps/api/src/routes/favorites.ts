import type { FastifyInstance } from "fastify";
import { addFavoriteSchema, type Persona } from "@acme/shared";
import { db, favorites as favoritesStore, personas as personasStore } from "../db.js";
import { authenticate } from "../middleware/auth.js";

export async function favoriteRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/favorites", async (request) => {
    const { id: userId } = request.user as { id: string };
    const userFavs = favoritesStore.get(userId);
    const result: Persona[] = [];

    if (userFavs) {
      for (const pid of userFavs) {
        const persona = personasStore.get(pid);
        if (persona) result.push(persona);
      }
    }

    return { favorites: result };
  });

  app.post("/favorites", async (request, reply) => {
    const { id: userId } = request.user as { id: string };
    const parsed = addFavoriteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { personaId } = parsed.data;

    const persona = db.personas.getById(personaId);
    if (!persona) {
      return reply.status(404).send({ error: "Persona not found" });
    }

    db.favorites.add(userId, personaId);
    return { success: true };
  });

  app.delete<{ Params: { personaId: string } }>(
    "/favorites/:personaId",
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const removed = db.favorites.remove(userId, request.params.personaId);
      if (!removed) {
        return reply.status(404).send({ error: "Favorite not found" });
      }
      return { success: true };
    }
  );
}
