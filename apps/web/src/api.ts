import type { Paint, Stroke } from "@cherry/doc";

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    credentials: "include",
    headers: init.body === undefined ? {} : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) {
    // Our routes send { error }, Better Auth sends { code, message }.
    const body = data as { error?: unknown; code?: unknown } | null;
    const code = body?.error ?? body?.code;
    throw new ApiError(res.status, typeof code === "string" ? code : `http_${res.status}`);
  }
  return data as T;
}

export type Role = "owner" | "admin" | "editor" | "viewer";
export type AccessMode = "invite" | "password" | "open";
export type Workspace = { id: string; name: string; publicId: string; accessMode: AccessMode; role?: Role };
export type User = { id: string; email: string; name: string };

export const signUp = (body: { name: string; email: string; password: string }) =>
  api<{ user: User }>("/api/auth/sign-up/email", { body });
export const signIn = (body: { email: string; password: string }) =>
  api<{ user: User }>("/api/auth/sign-in/email", { body });
export const signOut = () => api<unknown>("/api/auth/sign-out", { body: {} });
export const getSession = () => api<{ user: User } | null>("/api/auth/get-session");

export const createWorkspace = (body: { name: string; accessMode: AccessMode; password?: string }) =>
  api<{ workspace: Workspace }>("/api/workspaces", { body });
export const myWorkspaces = () => api<{ workspaces: Workspace[] }>("/api/workspaces/mine");
export const openWorkspaces = (q = "") =>
  api<{ workspaces: Workspace[] }>(`/api/workspaces/open?q=${encodeURIComponent(q)}`);
export const joinWithPassword = (body: { publicId: string; password: string }) =>
  api<{ workspace: Workspace }>("/api/workspaces/join", { body });
export const joinOpen = (id: string) =>
  api<{ workspace: Workspace }>(`/api/workspaces/${encodeURIComponent(id)}/join-open`, { method: "POST" });
export const acceptInvitation = (token: string) =>
  api<{ workspace: Workspace }>(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" });

export type Design = {
  id: string; workspaceId: string; title: string; width: number; height: number;
  unit: string; colorMode: string; updatedAt: string; createdBy: string;
};
export type NewDesign = { title: string; width: number; height: number; unit: string; colorMode: string; bleed?: number };

export const createDesign = (workspaceId: string, body: NewDesign) =>
  api<{ design: Design }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/designs`, { body });
export const listDesigns = (workspaceId: string) =>
  api<{ designs: Design[] }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/designs`);
export const getDesign = (id: string) =>
  api<{ design: Design; role: Role; state: string }>(`/api/designs/${encodeURIComponent(id)}`);
export const saveDesign = (id: string, state: string) =>
  api<{ design: Design; state: string }>(`/api/designs/${encodeURIComponent(id)}/state`, { method: "PUT", body: { state } });

export type Visibility = "private" | "workspace" | "public";
export type Shape = {
  id: string; name: string; tags: string[]; visibility: Visibility; workspaceId: string | null;
  d: string; width: number; height: number; fillRule: "nonzero" | "evenodd";
  fill: Paint | null; stroke: Stroke | null; createdBy: string; createdAt: string; mine: boolean;
};
export type NewShape = {
  name: string; tags: string[]; visibility: Visibility; workspaceId?: string;
  d: string; fillRule: "nonzero" | "evenodd"; fill?: Paint; stroke?: Stroke;
};

export const saveShape = (body: NewShape) => api<{ shape: Shape }>("/api/shapes", { body });
export const listShapes = (scope: "mine" | "workspace" | "public", opts: { workspaceId?: string; q?: string } = {}) => {
  const qs = new URLSearchParams({ scope });
  if (opts.workspaceId) qs.set("workspaceId", opts.workspaceId);
  if (opts.q) qs.set("q", opts.q);
  return api<{ shapes: Shape[] }>(`/api/shapes?${qs}`);
};
export const deleteShape = (id: string) => api<void>(`/api/shapes/${encodeURIComponent(id)}`, { method: "DELETE" });

export function toBase64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

const COPY: Record<string, string> = {
  wrong_password: "That password doesn't match this workspace.",
  not_found: "No workspace with that ID.",
  http_429: "Too many tries. Wait a minute and try again.",
  rate_limited: "Too many tries. Wait a minute and try again.",
  wrong_mode: "That workspace doesn't accept this way of joining.",
  password_required: "Choose a joining password of at least 8 characters.",
  invitation_invalid: "That invitation link isn't valid or has expired.",
  invitation_used: "That invitation has already been used.",
  invitation_wrong_email: "That invitation was sent to a different email address.",
  invalid_shape: "That shape couldn't be read. Try simplifying it.",
  invalid_body: "Please check the fields and try again.",
  INVALID_EMAIL_OR_PASSWORD: "Wrong email or password.",
  USER_ALREADY_EXISTS: "An account with that email already exists. Sign in instead.",
  PASSWORD_TOO_SHORT: "Use a password of at least 8 characters.",
  too_large: "This design is too large to save.",
  forbidden: "You have view-only access to this design.",
  invalid_document: "This change couldn't be saved because the design became invalid.",
};

/** Human copy for an error thrown by `api`. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return COPY[e.code] ?? COPY[`http_${e.status}`] ?? "Something went wrong. Try again.";
  return "Can't reach the server. Check your connection and try again.";
}
