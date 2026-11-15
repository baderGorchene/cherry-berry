import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import type { Config } from "./config";
import type { Db } from "./db/client";
import * as schema from "./db/schema";
import { getSettings, mayRegister } from "./admin/settings";
import { HttpError } from "./errors";

export function createAuth(config: Config, db: Db) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    baseURL: config.publicUrl,
    secret: config.authSecret,
    trustedOrigins: [config.publicUrl],
    databaseHooks: {
      user: {
        create: {
          // The registration policy only gates new accounts; sign-in is untouched.
          before: async (u) => {
            if (!(await mayRegister(db, u.email, await getSettings(db), config.adminEmails))) {
              throw new APIError("FORBIDDEN", { code: "registration_closed", message: "registration_closed" });
            }
          },
        },
      },
    },
  });
}
export const isAdmin = (config: Config, email: string) => config.adminEmails.includes(email.trim().toLowerCase());

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = { id: string; email: string; name: string };

/** Returns the signed-in user or throws a 401 `unauthorized` HttpError. */
export function createRequireUser(auth: Auth) {
  return async (request: FastifyRequest): Promise<SessionUser> => {
    const s = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!s) throw new HttpError(401, "unauthorized");
    return { id: s.user.id, email: s.user.email, name: s.user.name };
  };
}

/** Like createRequireUser, then 403 `forbidden` unless the user's email is in ADMIN_EMAILS. */
export function createRequireAdmin(auth: Auth, config: Config) {
  const requireUser = createRequireUser(auth);
  return async (request: FastifyRequest): Promise<SessionUser> => {
    const user = await requireUser(request);
    if (!isAdmin(config, user.email)) throw new HttpError(403, "forbidden");
    return user;
  };
}
