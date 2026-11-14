import type { FastifyInstance } from "fastify";
import type { Collab } from "./server";

/** The websocket endpoint for live documents; Hocuspocus authenticates each document from the upgrade request's cookie. */
export function registerCollabRoutes(app: FastifyInstance, collab: Collab) {
  app.get("/api/collab", { websocket: true }, (socket, req) => collab.handle(socket, req));
}
