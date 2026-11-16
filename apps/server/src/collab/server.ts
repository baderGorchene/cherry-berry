import { Hocuspocus } from "@hocuspocus/server";
import { eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import * as Y from "yjs";
import type { Auth } from "../auth";
import type { Db } from "../db/client";
import { designs, user } from "../db/schema";
import { checkUpdate, loadWithRole, persistState } from "../designs/service";
import { HttpError } from "../errors";
import type { Role } from "../workspaces/service";

export type Collab = {
  handle(socket: WebSocket, request: FastifyRequest): void;
  /** The live document's state, or null when nobody has it open. */
  liveState(id: string): Uint8Array | null;
  /** Runs `fn` on the live document (loading it if needed); its changes are broadcast and stored. `by` is recorded as the author. */
  withDocument<T>(id: string, fn: (doc: Y.Doc) => T | Promise<T>, by?: string): Promise<T>;
  /** Called after each store with the last user who changed the document. */
  onStored(cb: (id: string, doc: Y.Doc, by: string | null) => Promise<void>): void;
  /** Closes every live socket the user has open (a suspension must not wait for the next reconnect). */
  disconnectUser(userId: string): void;
  close(): Promise<void>;
};
type Context = { userId?: string; userName?: string; role?: Role };

/**
 * Hocuspocus turns a thrown `{ code, reason }` into a close message carrying `reason`: the provider's `onClose`
 * gets `{ event: { code: 1000, reason } }` for a rejected update, and `onAuthenticationFailed` gets `{ reason }`
 * for a refused connection.
 */
const reject = (e: unknown, fallback: string) => ({ code: 4000, reason: e instanceof HttpError ? e.code : fallback });

/** One live Yjs document per design (the document name is the design id). Assumes a single server process. */
export function createCollab(db: Db, auth: Auth, publicUrl: string): Collab {
  const origin = new URL(publicUrl).origin;
  const stored: Parameters<Collab["onStored"]>[0][] = [];
  const lastBy = new Map<string, string>();
  /** Documents with changes not yet in the database; they are never unloaded. */
  const dirty = new Set<string>();
  /** Documents whose last store failed. */
  const failed = new Set<string>();
  const persisting = new Set<Promise<unknown>>();

  const hp = new Hocuspocus<Context>({
    debounce: 2000,
    maxDebounce: 10000,
    unloadImmediately: true,

    async onAuthenticate({ requestHeaders, documentName, connectionConfig }) {
      const session = await auth.api.getSession({ headers: requestHeaders });
      if (!session) throw reject(null, "unauthorized");
      // Catches a session created in the instant before a suspension deleted the user's sessions.
      const [u] = await db.select({ at: user.suspendedAt }).from(user).where(eq(user.id, session.user.id));
      if (u?.at) throw reject(null, "suspended");
      // Postgres compares uuids case-insensitively; an upper-case alias would load a second live document for the row.
      if (documentName !== documentName.toLowerCase()) throw reject(null, "not_found");
      let role: Role;
      try {
        ({ role } = await loadWithRole(db, documentName, session.user.id));
      } catch (e) {
        if (e instanceof HttpError) throw reject(e, "not_found");
        throw e;
      }
      connectionConfig.readOnly = role === "viewer";
      return { userId: session.user.id, userName: session.user.name, role };
    },

    async onLoadDocument({ documentName }) {
      const [row] = await db.select({ state: designs.state }).from(designs).where(eq(designs.id, documentName));
      if (!row) throw new Error(`design ${documentName} not found`);
      return row.state;
    },

    // Runs inside readSyncMessage before the update is applied; `payload` is the update of a sync step 2 (type 1)
    // or update (type 2) message. Sync step 1 (type 0) carries a state vector, and awareness never reaches this hook.
    // Read-only (viewer) connections are skipped: Hocuspocus drops their writes itself.
    async beforeSync({ connection, context, document, type, payload }) {
      if (type === 0 || connection.readOnly) return;
      try {
        checkUpdate(document, payload, context.role ?? "viewer");
      } catch (e) {
        throw reject(e, "invalid_document");
      }
    },

    // Awareness is client-supplied: stamp the signed-in identity and keep only well-typed fields.
    async beforeHandleAwareness({ states, context }) {
      for (const [clientId, s] of states) {
        if (!context?.userId) { states.delete(clientId); continue; }
        const color = typeof s.user?.color === "string" ? s.user.color : undefined;
        s.user = { id: context.userId, name: context.userName ?? "", color };
        if (!Array.isArray(s.selection) || !s.selection.every((x: unknown) => typeof x === "string")) delete s.selection;
        if (typeof s.pageId !== "string") delete s.pageId;
        const c = s.cursor;
        if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) delete s.cursor;
        else s.cursor = { x: c.x, y: c.y };
      }
    },

    async onChange({ documentName, context }) {
      dirty.add(documentName);
      if (context?.userId) lastBy.set(documentName, context.userId);
    },

    async onStoreDocument({ documentName, document }) {
      if (!dirty.delete(documentName)) return;
      const run = (async () => {
        try {
          await persistState(db, documentName, document);
          failed.delete(documentName);
        } catch (e) {
          dirty.add(documentName);
          failed.add(documentName);
          throw e;
        }
        for (const cb of stored) await cb(documentName, document, lastBy.get(documentName) ?? null);
      })();
      persisting.add(run);
      try { await run; } finally { persisting.delete(run); }
    },

    // ponytail: a document whose store failed stays loaded until its next change, direct connection or close() stores it; add a retry timer if outages outlast sessions.
    async beforeUnloadDocument({ documentName }) {
      if (dirty.has(documentName)) throw new Error(`keeping ${documentName} loaded: changes not stored`);
    },

    async afterUnloadDocument({ documentName }) {
      lastBy.delete(documentName);
    },
  });

  return {
    handle(socket, request) {
      // The session cookie rides along on any site's websocket, so only our own pages may open one.
      if (request.headers.origin !== undefined && request.headers.origin !== origin) {
        socket.close(1008, "forbidden_origin");
        return;
      }
      const req = new Request(new URL(request.url, "http://localhost"), { headers: fromNodeHeaders(request.headers) });
      const conn = hp.handleConnection(socket, req, {});
      socket.on("message", (data: Buffer) => conn.handleMessage(new Uint8Array(data)));
      socket.on("close", (code, reason) => conn.handleClose({ code, reason: reason.toString() }));
      socket.on("pong", () => conn.touch());
    },
    liveState(id) {
      const doc = hp.documents.get(id.toLowerCase());
      return doc && !doc.isLoading ? Y.encodeStateAsUpdate(doc) : null;
    },
    async withDocument<T>(id: string, fn: (doc: Y.Doc) => T | Promise<T>, by?: string) {
      const context: Context = by ? { userId: by } : {};
      id = id.toLowerCase(); // Postgres compares uuids case-insensitively; one live document per row
      const conn = await hp.openDirectConnection(id, context);
      const doc = conn.document!;
      let out!: T | Promise<T>;
      try {
        // The origin carries `by` to onChange; work an async `fn` does after its first await runs outside it.
        doc.transact(() => { out = fn(doc); }, { source: "local", context });
        out = await out;
      } finally {
        await conn.disconnect();
      }
      // Leaving stores immediately; Hocuspocus only logs a failed store, and the document stays live (beforeUnloadDocument).
      if (failed.has(id)) throw new HttpError(503, "not_saved");
      return out;
    },
    onStored(cb) { stored.push(cb); },
    disconnectUser(userId) {
      for (const doc of hp.documents.values()) {
        for (const c of doc.getConnections()) if (c.context?.userId === userId) c.close({ code: 4000, reason: "suspended" });
      }
    },
    async close() {
      hp.closeConnections();
      hp.flushPendingStores();
      // A flushed store reaches onStoreDocument only after its save mutex is free, so wait until none is running.
      do {
        await new Promise((r) => setImmediate(r));
        await Promise.allSettled([...persisting]);
      } while (persisting.size || [...hp.documents.values()].some((d) => d.saveMutex.isLocked()));
      // A failed store leaves its document dirty, and flushPendingStores skips it: write it one last time.
      for (const [id, doc] of hp.documents) {
        if (!dirty.delete(id)) continue;
        await persistState(db, id, doc).catch((e) => console.error(`collab: could not store ${id} on close`, e));
      }
    },
  };
}
