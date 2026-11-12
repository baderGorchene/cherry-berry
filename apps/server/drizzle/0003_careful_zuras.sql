CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"workspace_id" uuid,
	"visibility" text NOT NULL,
	"title" text NOT NULL,
	"tags" text[] NOT NULL,
	"license" text NOT NULL,
	"attribution" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"format" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assets_visibility" CHECK ("assets"."visibility" in ('private','workspace','public')),
	CONSTRAINT "assets_license" CHECK ("assets"."license" in ('cc0','cc-by','own','workspace-only')),
	CONSTRAINT "assets_workspace" CHECK (("assets"."visibility" = 'workspace') = ("assets"."workspace_id" is not null)),
	CONSTRAINT "assets_workspace_only" CHECK ("assets"."license" <> 'workspace-only' or "assets"."visibility" = 'workspace'),
	CONSTRAINT "assets_cc_by" CHECK ("assets"."license" <> 'cc-by' or "assets"."attribution" <> '')
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_sha256" ON "assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "assets_visibility_created" ON "assets" USING btree ("visibility","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "assets_workspace" ON "assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "assets_created_by" ON "assets" USING btree ("created_by");