import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { isAdmin, type SessionUser } from "../auth";
import { getSettings } from "../admin/settings";
import type { Config } from "../config";
import { WorkspaceError } from "./errors";
import type { Db } from "../db/client";
import { parse } from "../http";
import * as svc from "./service";

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  accessMode: z.enum(["invite", "password", "open"]),
  password: z.string().max(200).optional(),
});
const JoinBody = z.object({ publicId: z.string().trim().min(1).max(64), password: z.string().max(200) });
const InviteBody = z.object({ email: z.email(), role: z.enum(["admin", "editor", "viewer"]) });
const OpenQuery = z.object({ q: z.string().max(80).optional(), limit: z.coerce.number().int().optional() });
const IdParams = z.object({ id: z.string() });
const TokenParams = z.object({ token: z.string() });

export function registerWorkspaceRoutes(
  app: FastifyInstance, db: Db, requireUser: (req: FastifyRequest) => Promise<SessionUser>, config: Config,
) {
  app.post("/api/workspaces", async (req, reply) => {
    const user = await requireUser(req);
    if ((await getSettings(db)).workspaceCreation === "admins" && !isAdmin(config, user.email)) throw new WorkspaceError("forbidden");
    const workspace = await svc.createWorkspace(db, user.id, parse(CreateBody, req.body));
    return reply.status(201).send({ workspace });
  });

  app.get("/api/workspaces/mine", async (req) => {
    const user = await requireUser(req);
    return { workspaces: await svc.listMyWorkspaces(db, user.id) };
  });

  app.get("/api/workspaces/open", async (req) => {
    await requireUser(req);
    return { workspaces: await svc.listOpenWorkspaces(db, parse(OpenQuery, req.query)) };
  });

  app.post("/api/workspaces/join", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const user = await requireUser(req);
    const body = parse(JoinBody, req.body);
    return { workspace: await svc.joinWithPassword(db, user.id, body.publicId, body.password) };
  });

  app.post("/api/workspaces/:id/join-open", async (req) => {
    const user = await requireUser(req);
    return { workspace: await svc.joinOpen(db, user.id, parse(IdParams, req.params).id) };
  });

  app.post("/api/workspaces/:id/invitations", async (req, reply) => {
    const user = await requireUser(req);
    const inv = await svc.createInvitation(db, user.id, parse(IdParams, req.params).id, parse(InviteBody, req.body));
    return reply.status(201).send(inv);
  });

  app.post("/api/invitations/:token/accept", async (req) => {
    const user = await requireUser(req);
    return { workspace: await svc.acceptInvitation(db, user.id, user.email, parse(TokenParams, req.params).token) };
  });
}
