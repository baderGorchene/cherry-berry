import { useEffect, useState } from "react";
import * as Y from "yjs";
import { LOCAL, REMOTE, createUndoManager, yToDoc } from "@cherry/doc";
import { ApiError, fromBase64, getDesign, saveDesign, toBase64, type Design, type Role } from "../api";
import { Autosave, type SaveStatus } from "./autosave";

export type DesignState =
  | { state: "loading" }
  | { state: "failed"; message: string }
  | { state: "ready"; ydoc: Y.Doc; design: Design; role: Role; readOnly: boolean; undo: Y.UndoManager; status: SaveStatus; statusMessage?: string };

type Ready = Extract<DesignState, { state: "ready" }>;

export function useDesign(id: string): DesignState {
  const [s, setS] = useState<DesignState>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    setS({ state: "loading" });
    getDesign(id).then(
      ({ design, role, state }) => {
        if (cancelled) return;
        const ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, fromBase64(state), REMOTE);
        if (!yToDoc(ydoc).ok) return setS({ state: "failed", message: "This design couldn't be opened." });
        const undo = createUndoManager(ydoc); // after load, so loading isn't undoable
        const readOnly = role === "viewer";
        const base: Ready = { state: "ready", ydoc, design, role, readOnly, undo, status: "saved" };
        setS(base);
        if (readOnly) return;
        const autosave = new Autosave({
          encode: () => Y.encodeStateAsUpdate(ydoc),
          save: async (u) => fromBase64((await saveDesign(id, toBase64(u))).state),
          onRemote: (u) => Y.applyUpdate(ydoc, u, REMOTE),
          onStatus: (status, statusMessage) => !cancelled && setS({ ...base, status, statusMessage }),
        });
        const onUpdate = (_: Uint8Array, origin: unknown) => { if (origin === LOCAL) autosave.markDirty(); };
        const onUnload = (e: BeforeUnloadEvent) => { if (autosave.pending) e.preventDefault(); };
        ydoc.on("update", onUpdate);
        window.addEventListener("beforeunload", onUnload);
        cleanup = () => {
          ydoc.off("update", onUpdate);
          window.removeEventListener("beforeunload", onUnload);
          void autosave.flush().finally(() => autosave.dispose());
        };
      },
      (e) => !cancelled && setS({
        state: "failed",
        message: e instanceof ApiError && e.status === 404
          ? "This design doesn't exist or you don't have access."
          : "This design couldn't be opened.",
      }),
    );
    return () => { cancelled = true; cleanup(); };
  }, [id]);

  return s;
}
