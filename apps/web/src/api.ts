import type { BrandKitContent, ExportAsset, ExportBody, Paint, Stroke } from "@cherry/doc";

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const form = init.body instanceof FormData; // the browser sets the multipart content type and boundary
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    credentials: "include",
    headers: init.body === undefined || form ? {} : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : form ? (init.body as FormData) : JSON.stringify(init.body),
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
  unit: string; colorMode: string; updatedAt: string; createdBy: string; kitId: string | null;
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

export type AssetKind = "image" | "gif" | "svg";
export type License = "cc0" | "cc-by" | "own" | "workspace-only";
export type Asset = {
  id: string; title: string; tags: string[]; kind: AssetKind; format: string;
  width: number; height: number; bytes: number; license: License; attribution: string;
  visibility: Visibility; workspaceId: string | null; workspaceName: string | null;
  createdBy: string; uploaderName: string; createdAt: string; mine: boolean; usedIn: number;
};
export type NewAsset = {
  title: string; tags: string[]; license: License; attribution: string; visibility: Visibility; workspaceId?: string;
};
export type AssetFilters = { workspaceId?: string; kind?: AssetKind; license?: License; q?: string };

const enc = encodeURIComponent;
/** Library calls report 404/403 in their own words; the shared copy talks about workspaces and designs. */
export const libraryError = (e: unknown): unknown =>
  e instanceof ApiError && (e.code === "not_found" || e.code === "forbidden") ? new ApiError(e.status, `library_${e.code}`) : e;
const lib = <T>(p: Promise<T>) => p.catch((e) => { throw libraryError(e); });
export const listAssets = (scope: "mine" | "workspace" | "public", opts: AssetFilters = {}) => {
  const qs = new URLSearchParams({ scope });
  for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, v);
  return lib(api<{ assets: Asset[] }>(`/api/assets?${qs}`));
};
export const getAsset = (id: string) => lib(api<{ asset: Asset }>(`/api/assets/${enc(id)}`));
/** An existing asset with these bytes that is usable in `workspaceId` (or anywhere private, when omitted). */
export const assetByHash = (sha256: string, workspaceId?: string) =>
  api<{ asset: Asset }>(`/api/assets/by-hash/${enc(sha256)}${workspaceId ? `?workspaceId=${enc(workspaceId)}` : ""}`).then((r) => r.asset, (e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
export async function uploadAsset(file: File, fields: NewAsset): Promise<{ asset: Asset; duplicate: boolean }> {
  const f = new FormData();
  f.set("file", file);
  f.set("title", fields.title);
  f.set("tags", fields.tags.join(","));
  f.set("license", fields.license);
  f.set("attribution", fields.attribution);
  f.set("visibility", fields.visibility);
  if (fields.workspaceId) f.set("workspaceId", fields.workspaceId);
  f.set("confirmed", "true"); // the caller's dialog collects the rights confirmation
  try {
    return await lib(api<{ asset: Asset; duplicate: boolean }>(`/api/assets`, { body: f }));
  } catch (e) {
    // `too_large` means a design that can't be saved elsewhere; for a file it has its own copy.
    throw e instanceof ApiError && e.code === "too_large" ? new ApiError(e.status, "upload_too_large") : e;
  }
}
export const updateAsset = (id: string, patch: Partial<NewAsset>) =>
  lib(api<{ asset: Asset }>(`/api/assets/${enc(id)}`, { method: "PATCH", body: patch }));
export const deleteAsset = (id: string) => lib(api<void>(`/api/assets/${enc(id)}`, { method: "DELETE" }));
export const linkAssetToDesign = (designId: string, assetId: string) =>
  lib(api<void>(`/api/designs/${enc(designId)}/assets`, { body: { assetId } }));
export const assetUrl = (id: string, kind: "file" | "thumb") => `/api/assets/${enc(id)}/${kind}`;

export type ReportBody = { targetType: "asset" | "shape" | "template"; targetId: string; reason: "copyright" | "inappropriate" | "spam" | "other"; note?: string };
export const reportItem = (body: ReportBody) => lib(api<{ report: { id: string } }>("/api/reports", { body }));

export type InstanceInfo = { admin: boolean; canCreateWorkspace: boolean; maxUploadMb: number };
export const instanceInfo = () => api<InstanceInfo>("/api/instance");

export type InstanceSettings = {
  registration: "open" | "invited" | "domains"; allowedDomains: string[];
  workspaceCreation: "anyone" | "admins"; maxUploadMb: 20 | 50 | 100; storageQuotaGb: number | null;
};
export type AdminOverview = {
  version: string; database: string; storage: string; usedBytes: number; quotaBytes: number | null;
  users: number; workspaces: number; designs: number; queue: number;
};
export type AdminUser = { id: string; name: string; email: string; createdAt: string; suspended: boolean; admin: boolean; workspaces: number; usedBytes: number };
export type AdminWorkspace = { id: string; name: string; joinMode: AccessMode; members: number; designs: number; usedBytes: number };
export type StorageReport = { usedBytes: number; quotaBytes: number | null; byWorkspace: { id: string; name: string; usedBytes: number }[]; personalBytes: number };
type Uploader = { id: string; name: string };
export type QueueItem =
  | { kind: "report"; targetType: "asset" | "shape" | "template"; targetId: string; title: string; uploader: Uploader;
      visibility: "public"; license: string; reason: ReportBody["reason"]; note: string; count: number; createdAt: string }
  | { kind: "sanitized"; targetType: "asset"; targetId: string; title: string; uploader: Uploader; createdAt: string };
export type QueueAction = "keep" | "remove" | "suspend" | "approve";

const query = (cursor?: string | null, q?: string) => {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (cursor) qs.set("cursor", cursor);
  const s = qs.toString();
  return s ? `?${s}` : "";
};
export const adminOverview = () => api<AdminOverview>("/api/admin/overview");
export const adminSettings = () => api<{ settings: InstanceSettings }>("/api/admin/settings").then((r) => r.settings);
export const saveAdminSettings = (settings: InstanceSettings) =>
  api<{ settings: InstanceSettings }>("/api/admin/settings", { method: "PUT", body: settings }).then((r) => r.settings);
export const adminUsers = (q = "", cursor?: string | null) => api<{ users: AdminUser[]; next: string | null }>(`/api/admin/users${query(cursor, q)}`);
export const suspendUser = (id: string) => api<void>(`/api/admin/users/${enc(id)}/suspend`, { method: "POST" });
export const unsuspendUser = (id: string) => api<void>(`/api/admin/users/${enc(id)}/unsuspend`, { method: "POST" });
export const adminWorkspaces = (cursor?: string | null) => api<{ workspaces: AdminWorkspace[]; next: string | null }>(`/api/admin/workspaces${query(cursor)}`);
export const adminStorage = () => api<StorageReport>("/api/admin/storage");
export const moderationQueue = () => api<{ items: QueueItem[] }>("/api/admin/moderation").then((r) => r.items);
export const moderate = (item: Pick<QueueItem, "targetType" | "targetId">, action: QueueAction) =>
  api<void>(`/api/admin/moderation/${item.targetType}/${enc(item.targetId)}`, { body: { action } });

export type Font = { id: string; kitId: string; family: string; weight: number; style: "normal" | "italic"; format: "woff2" | "woff" | "ttf" | "otf"; bytes: number };
export type BrandKit = { id: string; workspaceId: string; name: string; content: BrandKitContent; fonts: Font[]; updatedAt: string };

export const listKits = (workspaceId: string) => api<{ kits: BrandKit[] }>(`/api/workspaces/${enc(workspaceId)}/brand-kits`).then((r) => r.kits);
export const createKit = (workspaceId: string, body: { name: string; content?: BrandKitContent }) =>
  api<{ kit: BrandKit }>(`/api/workspaces/${enc(workspaceId)}/brand-kits`, { body }).then((r) => r.kit);
export const getKit = (id: string) => api<{ kit: BrandKit }>(`/api/brand-kits/${enc(id)}`).then((r) => r.kit);
export const saveKit = (id: string, body: { name: string; content: BrandKitContent }) =>
  api<{ kit: BrandKit }>(`/api/brand-kits/${enc(id)}`, { method: "PUT", body }).then((r) => r.kit);
export const deleteKit = (id: string) => api<void>(`/api/brand-kits/${enc(id)}`, { method: "DELETE" });
export const uploadFont = (kitId: string, file: File, meta: { family: string; weight: number; style: "normal" | "italic" }) => {
  const f = new FormData();
  f.set("family", meta.family);
  f.set("weight", String(meta.weight));
  f.set("style", meta.style);
  f.set("confirmed", "true"); // the caller's dialog collects the rights confirmation
  f.set("file", file); // after the fields, so the server has them when it reads the file part
  return api<{ font: Font }>(`/api/brand-kits/${enc(kitId)}/fonts`, { body: f }).then((r) => r.font);
};
export const deleteFont = (id: string) => api<void>(`/api/fonts/${enc(id)}`, { method: "DELETE" });
export const fontUrl = (id: string) => `/api/fonts/${enc(id)}/file`;
export const setDesignKit = (designId: string, kitId: string | null) =>
  api<{ design: Design }>(`/api/designs/${enc(designId)}`, { method: "PATCH", body: { kitId } }).then((r) => r.design);

export type TemplateCategory = "social" | "print" | "presentation" | "cards" | "other";
export type Template = {
  id: string; workspaceId: string; visibility: "workspace" | "public"; status: "published" | "pending";
  kitId: string | null; kitName: string | null; name: string; category: TemplateCategory; license: "cc0" | "cc-by" | "workspace-only";
  attribution: string; width: number; height: number; unit: string; colorMode: string;
  createdBy: string; authorName: string; createdAt: string; mine: boolean;
};
export const listTemplates = (scope: "workspace" | "public", opts: { workspaceId?: string; q?: string; category?: TemplateCategory } = {}) => {
  const qs = new URLSearchParams({ scope });
  for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, v);
  return api<{ templates: Template[] }>(`/api/templates?${qs}`).then((r) => r.templates);
};
export const templateThumbUrl = (id: string) => `/api/templates/${enc(id)}/thumb`;
export const TEMPLATE_CATEGORIES: [TemplateCategory, string][] = [
  ["social", "Social"], ["print", "Print"], ["presentation", "Presentations"], ["cards", "Cards & invites"], ["other", "Other"],
];
export type PublishBody = {
  name: string; category: TemplateCategory; visibility: "workspace" | "public"; license: Template["license"];
  attribution: string; kitId?: string | null; thumb: string;
};
export const publishTemplate = (designId: string, body: PublishBody) =>
  api<{ template: Template }>(`/api/designs/${enc(designId)}/template`, { body }).then((r) => r.template);
export const startFromTemplate = (id: string, workspaceId: string) =>
  api<{ design: Design }>(`/api/templates/${enc(id)}/use`, { body: { workspaceId } }).then((r) => r.design);
export const approveTemplate = (id: string) => api<{ template: Template }>(`/api/templates/${enc(id)}/approve`, { method: "POST" }).then((r) => r.template);
export const deleteTemplate = (id: string) => api<void>(`/api/templates/${enc(id)}`, { method: "DELETE" });

export type VersionSummary = {
  id: string; kind: "auto" | "named" | "restore" | "branch"; name: string | null; summary: string; createdAt: string;
  createdBy: { id: string; name: string } | null; branchDesignId: string | null;
};
export const listVersions = (designId: string) =>
  api<{ versions: VersionSummary[] }>(`/api/designs/${enc(designId)}/versions`).then((r) => r.versions);
export const nameVersion = (designId: string, name: string) =>
  api<{ version: VersionSummary }>(`/api/designs/${enc(designId)}/versions`, { body: { name } }).then((r) => r.version);
/** `null` un-names a named version, which turns it back into an auto version. */
export const renameVersion = (id: string, name: string | null) =>
  api<{ version: VersionSummary }>(`/api/versions/${enc(id)}`, { method: "PATCH", body: { name } }).then((r) => r.version);
export const versionState = (id: string) => api<{ state: string }>(`/api/versions/${enc(id)}/state`).then((r) => r.state);
export const restoreVersion = (id: string) => api<{ design: Design }>(`/api/versions/${enc(id)}/restore`, { method: "POST" }).then((r) => r.design);
export const branchVersion = (id: string, name: string) =>
  api<{ design: Design }>(`/api/versions/${enc(id)}/branch`, { body: { name } }).then((r) => r.design);

export const exportInfo = (designId: string) => api<{ fonts: string[]; assets: ExportAsset[] }>(`/api/designs/${enc(designId)}/export/info`);
/** The rendered file; the name comes from `Content-Disposition`, preferring its UTF-8 `filename*`. */
export async function exportFile(designId: string, body: ExportBody): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api/designs/${enc(designId)}/export`, {
    method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    let code: unknown;
    try { code = (await res.json()).error; } catch { /* non-JSON body */ }
    throw new ApiError(res.status, typeof code === "string" ? code : `http_${res.status}`);
  }
  const cd = res.headers.get("content-disposition") ?? "";
  const exact = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  let filename = /filename="([^"]*)"/i.exec(cd)?.[1] ?? "design";
  try { if (exact) filename = decodeURIComponent(exact); } catch { /* keep the ASCII name */ }
  return { blob: await res.blob(), filename };
}

type NativeSaver = { postMessage(msg: string): void };

/** Hands a file to the user: the share sheet inside the mobile app (WebViews ignore `blob:` downloads), else a download.
 * The mobile shells expose a `cherryNative` handler to the server's page: Android via MainActivity, iOS via AppViewController. */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const w = window as { cherryNative?: NativeSaver; webkit?: { messageHandlers?: { cherryNative?: NativeSaver } } };
  const native = w.cherryNative ?? w.webkit?.messageHandlers?.cherryNative;
  if (native) {
    const base64 = toBase64(new Uint8Array(await blob.arrayBuffer()));
    native.postMessage(JSON.stringify({ type: "save", filename, mime: blob.type, base64 }));
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

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
  registration_closed: "This server isn't taking new sign-ups. Ask an admin to invite you.",
  suspended: "This account is suspended. Contact the server's admin.",
  INVALID_EMAIL_OR_PASSWORD: "Wrong email or password.",
  USER_ALREADY_EXISTS: "An account with that email already exists. Sign in instead.",
  PASSWORD_TOO_SHORT: "Use a password of at least 8 characters.",
  unsupported_type: "That file type isn't supported. Use PNG, JPG, WEBP, GIF or SVG.",
  invalid_image: "That file couldn't be read as an image.",
  upload_too_large: "That file is too large for this server (2 MB max for SVG).",
  busy: "The server is busy. Try again in a moment.",
  library_not_found: "This visual is no longer available.",
  library_forbidden: "You don't have permission to change this visual.",
  rights_not_confirmed: "Confirm you have the right to share this file.",
  too_large: "This design is too large to save.",
  forbidden: "You have view-only access to this design.",
  brand_locked: "This layer is locked by the brand template.",
  invalid_logo: "That logo isn't available to this workspace.",
  invalid_font: "That file isn't a font we can use. Choose WOFF2, WOFF, TTF or OTF.",
  template_private_assets: "Every visual in a public template must be public. Make them public or publish to this workspace.",
  invalid_document: "This change couldn't be saved because the design became invalid.",
  not_saved: "Couldn't save just now. Your changes are kept, try again.",
  export_too_large: "This export is too large. Try a smaller scale or fewer pages.",
};

/** Human copy for an error thrown by `api`. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return COPY[e.code] ?? COPY[`http_${e.status}`] ?? "Something went wrong. Try again.";
  return "Can't reach the server. Check your connection and try again.";
}
