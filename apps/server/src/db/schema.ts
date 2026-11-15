import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, customType, integer, jsonb, index, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// PGlite returns bytea as Uint8Array, node-postgres as Buffer.
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => new Uint8Array(v),
});

// --- Better Auth tables (shape required by better-auth's drizzle adapter) ---
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Cherry Berry workspaces ---
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  publicId: text("public_id").notNull().unique(),
  accessMode: text("access_mode").notNull(),
  passwordHash: text("password_hash"),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("workspaces_access_mode", sql`${t.accessMode} in ('invite','password','open')`)]);

export const memberships = pgTable("memberships", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  joinedVia: text("joined_via").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.userId] }),
  check("memberships_role", sql`${t.role} in ('owner','admin','editor','viewer')`),
  check("memberships_joined_via", sql`${t.joinedVia} in ('created','invite','password','open')`),
]);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: text("invited_by").notNull().references(() => user.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
}, (t) => [check("invitations_role", sql`${t.role} in ('admin','editor','viewer')`)]);

export const designs = pgTable("designs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  width: real("width").notNull(),
  height: real("height").notNull(),
  unit: text("unit").notNull(),
  colorMode: text("color_mode").notNull(),
  state: bytea("state").notNull(),
  kitId: uuid("kit_id").references((): AnyPgColumn => brandKits.id, { onDelete: "set null" }),
  parentDesignId: uuid("parent_design_id").references((): AnyPgColumn => designs.id, { onDelete: "set null" }),
  parentVersionId: uuid("parent_version_id").references((): AnyPgColumn => designVersions.id, { onDelete: "set null" }),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("designs_workspace_updated").on(t.workspaceId, t.updatedAt.desc())]);

export const designVersions = pgTable("design_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  designId: uuid("design_id").notNull().references(() => designs.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  name: text("name"),
  summary: text("summary").notNull(),
  state: bytea("state").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  branchDesignId: uuid("branch_design_id").references((): AnyPgColumn => designs.id, { onDelete: "set null" }),
}, (t) => [
  check("design_versions_kind", sql`${t.kind} in ('auto','named','restore','branch')`),
  check("design_versions_name", sql`char_length(${t.name}) <= 80`),
  index("design_versions_design_created").on(t.designId, t.createdAt.desc()),
]);

export const brandKits = pgTable("brand_kits", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: jsonb("content").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("brand_kits_workspace").on(t.workspaceId)]);

export const brandFonts = pgTable("brand_fonts", {
  id: uuid("id").primaryKey().defaultRandom(),
  kitId: uuid("kit_id").notNull().references(() => brandKits.id, { onDelete: "cascade" }),
  family: text("family").notNull(),
  weight: integer("weight").notNull(),
  style: text("style").notNull(),
  format: text("format").notNull(),
  sha256: text("sha256").notNull(),
  bytes: integer("bytes").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("brand_fonts_kit").on(t.kitId),
  check("brand_fonts_style", sql`${t.style} in ('normal', 'italic')`),
  check("brand_fonts_format", sql`${t.format} in ('woff2', 'woff', 'ttf', 'otf')`),
]);

export const shapes = pgTable("shapes", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  visibility: text("visibility").notNull(),
  name: text("name").notNull(),
  tags: text("tags").array().notNull(),
  d: text("d").notNull(),
  width: real("width").notNull(),
  height: real("height").notNull(),
  fillRule: text("fill_rule").notNull(),
  fill: jsonb("fill"),
  stroke: jsonb("stroke"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("shapes_visibility", sql`${t.visibility} in ('private','workspace','public')`),
  check("shapes_workspace", sql`(${t.visibility} = 'workspace') = (${t.workspaceId} is not null)`),
  index("shapes_visibility_created").on(t.visibility, t.createdAt.desc()),
  index("shapes_workspace").on(t.workspaceId),
  index("shapes_created_by").on(t.createdBy),
]);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  visibility: text("visibility").notNull(),
  title: text("title").notNull(),
  tags: text("tags").array().notNull(),
  license: text("license").notNull(),
  attribution: text("attribution").notNull().default(""),
  kind: text("kind").notNull(),
  format: text("format").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  check("assets_visibility", sql`${t.visibility} in ('private','workspace','public')`),
  check("assets_license", sql`${t.license} in ('cc0','cc-by','own','workspace-only')`),
  check("assets_workspace", sql`(${t.visibility} = 'workspace') = (${t.workspaceId} is not null)`),
  check("assets_workspace_only", sql`${t.license} <> 'workspace-only' or ${t.visibility} = 'workspace'`),
  check("assets_cc_by", sql`${t.license} <> 'cc-by' or ${t.attribution} <> ''`),
  index("assets_sha256").on(t.sha256),
  index("assets_visibility_created").on(t.visibility, t.createdAt.desc()),
  index("assets_workspace").on(t.workspaceId),
  index("assets_created_by").on(t.createdBy),
]);

export const assetUses = pgTable("asset_uses", {
  designId: uuid("design_id").notNull().references(() => designs.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.designId, t.assetId] }), index("asset_uses_asset").on(t.assetId)]);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Polymorphic (asset, shape or template), so targetId has no foreign key; readers join to the live target.
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reporterId: text("reporter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  check("reports_target_type", sql`${t.targetType} in ('asset','shape','template')`),
  check("reports_reason", sql`${t.reason} in ('copyright','inappropriate','spam','other')`),
  check("reports_note", sql`char_length(${t.note}) <= 500`),
  check("reports_status", sql`${t.status} in ('open','dismissed','removed')`),
  uniqueIndex("reports_target_reporter").on(t.targetType, t.targetId, t.reporterId),
  index("reports_target_status").on(t.targetType, t.targetId, t.status),
]);

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  visibility: text("visibility").notNull(),
  status: text("status").notNull().default("published"),
  kitId: uuid("kit_id").references(() => brandKits.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  license: text("license").notNull(),
  attribution: text("attribution").notNull().default(""),
  width: real("width").notNull(),
  height: real("height").notNull(),
  unit: text("unit").notNull(),
  colorMode: text("color_mode").notNull(),
  state: bytea("state").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("templates_visibility", sql`${t.visibility} in ('workspace','public')`),
  check("templates_status", sql`${t.status} in ('published','pending')`),
  check("templates_category", sql`${t.category} in ('social','print','presentation','cards','other')`),
  check("templates_license", sql`${t.license} in ('cc0','cc-by','workspace-only')`),
  check("templates_workspace_only", sql`(${t.license} = 'workspace-only') = (${t.visibility} = 'workspace')`),
  check("templates_kit", sql`${t.kitId} is null or ${t.visibility} = 'workspace'`),
  check("templates_cc_by", sql`${t.license} <> 'cc-by' or ${t.attribution} <> ''`),
  index("templates_visibility_created").on(t.visibility, t.createdAt.desc()),
  index("templates_workspace").on(t.workspaceId),
]);

// One row (id = 1); a missing row reads as the defaults.
export const instanceSettings = pgTable("instance_settings", {
  id: integer("id").primaryKey().default(1),
  registration: text("registration").notNull().default("open"),
  allowedDomains: text("allowed_domains").array().notNull().default(sql`'{}'::text[]`),
  workspaceCreation: text("workspace_creation").notNull().default("anyone"),
  maxUploadMb: integer("max_upload_mb").notNull().default(50),
  storageQuotaGb: integer("storage_quota_gb"),
}, (t) => [
  check("instance_settings_single", sql`${t.id} = 1`),
  check("instance_settings_registration", sql`${t.registration} in ('open','invited','domains')`),
  check("instance_settings_workspace_creation", sql`${t.workspaceCreation} in ('anyone','admins')`),
  check("instance_settings_max_upload", sql`${t.maxUploadMb} in (20,50,100)`),
  check("instance_settings_quota", sql`${t.storageQuotaGb} is null or ${t.storageQuotaGb} >= 1`),
]);
