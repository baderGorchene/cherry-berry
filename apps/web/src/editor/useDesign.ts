import { useEffect, useReducer, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { createUndoManager, yToDoc } from "@cherry/doc";
import { ApiError, errorMessage, getDesign, type Design, type Role } from "../api";

export type SaveStatus = "saved" | "unsaved" | "saving" | "offline" | "error";

export type DesignState =
  | { state: "loading" }
  | { state: "failed"; message: string }
  | { state: "ready"; ydoc: Y.Doc; provider: HocuspocusProvider; design: Design; role: Role; readOnly: boolean; undo: Y.UndoManager; status: SaveStatus; statusMessage?: string; statusCode?: string; reload(): void };

type Ready = Extract<DesignState, { state: "ready" }>;

const REJECTIONS = ["brand_locked", "invalid_document"];

export function useDesign(id: string): DesignState {
  const [s, setS] = useState<DesignState>({ state: "loading" });
  const [loads, reload] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let cancelled = false;
    let discard = false;
    let ready: Ready | null = null;
    let connected = false;
    let rejected: string | null = null;
    let provider: HocuspocusProvider | null = null;
    const pending = () => (provider?.unsyncedChanges ?? 0) > 0;
    const onUnload = (e: BeforeUnloadEvent) => { if (pending()) { e.preventDefault(); e.returnValue = ""; } };
    const push = () => {
      if (!ready || cancelled) return;
      const status: SaveStatus = rejected ? "error" : !connected ? "offline" : pending() ? "saving" : "saved";
      setS({ ...ready, status, statusCode: rejected ?? undefined, statusMessage: rejected ? errorMessage(new ApiError(0, rejected)) : undefined });
    };
    const fail = (message: string) => { provider?.destroy(); if (!cancelled) setS({ state: "failed", message }); };
    // The browser knows it is offline before the socket times out; drop and re-open it right away.
    const goOffline = () => provider?.disconnect();
    const goOnline = () => void provider?.connect();
    setS({ state: "loading" });
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    getDesign(id).then(
      ({ design, role }) => {
        if (cancelled) return;
        const ydoc = new Y.Doc();
        const p = provider = new HocuspocusProvider({
          url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/collab`,
          name: id,
          document: ydoc,
          onSynced: () => {
            connected = true;
            if (cancelled) return;
            if (ready) return push();
            if (!yToDoc(ydoc).ok) return fail("This design couldn't be opened.");
            ready = {
              state: "ready", ydoc, provider: p, design, role, readOnly: role === "viewer",
              undo: createUndoManager(ydoc), // after the first sync, so loading isn't undoable
              status: "saved",
              reload: () => { discard = true; reload(); }, // drops the local doc for the server's
            };
            push();
          },
          onStatus: ({ status }) => { connected = status === "connected"; push(); },
          onUnsyncedChanges: push,
          // A rejected update closes the document: the reason arrives as event.reason (code is always 1000).
          onClose: ({ event }) => { if (REJECTIONS.includes(event.reason)) { rejected = event.reason; push(); } },
          onAuthenticationFailed: () => { if (!ready) fail("This design doesn't exist or you don't have access."); },
        });
      },
      (e) => fail(e instanceof ApiError && e.status === 404
        ? "This design doesn't exist or you don't have access."
        : "This design couldn't be opened."),
    );
    return () => {
      cancelled = true;
      const p = provider;
      const release = () => {
        window.removeEventListener("beforeunload", onUnload);
        window.removeEventListener("offline", goOffline);
        window.removeEventListener("online", goOnline);
      };
      if (!p || discard || rejected || !pending()) { p?.destroy(); release(); return; }
      // Pending edits keep syncing (and guarding unload) after in-app navigation until they land,
      // are rejected, or the connection is refused. The online listener stays so they can still sync.
      const done = () => { release(); p.destroy(); };
      p.on("unsyncedChanges", () => { if (!pending()) done(); });
      p.on("close", ({ event }: { event: { reason: string } }) => { if (REJECTIONS.includes(event.reason)) done(); });
      p.on("authenticationFailed", done);
    };
  }, [id, loads]);

  return s;
}
