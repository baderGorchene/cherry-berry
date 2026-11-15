CREATE TABLE "instance_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"registration" text DEFAULT 'open' NOT NULL,
	"allowed_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"workspace_creation" text DEFAULT 'anyone' NOT NULL,
	"max_upload_mb" integer DEFAULT 50 NOT NULL,
	"storage_quota_gb" integer,
	CONSTRAINT "instance_settings_single" CHECK ("instance_settings"."id" = 1),
	CONSTRAINT "instance_settings_registration" CHECK ("instance_settings"."registration" in ('open','invited','domains')),
	CONSTRAINT "instance_settings_workspace_creation" CHECK ("instance_settings"."workspace_creation" in ('anyone','admins')),
	CONSTRAINT "instance_settings_max_upload" CHECK ("instance_settings"."max_upload_mb" in (20,50,100)),
	CONSTRAINT "instance_settings_quota" CHECK ("instance_settings"."storage_quota_gb" is null or "instance_settings"."storage_quota_gb" >= 1)
);
