CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"visibility" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"kit_id" uuid,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"license" text NOT NULL,
	"attribution" text DEFAULT '' NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"unit" text NOT NULL,
	"color_mode" text NOT NULL,
	"state" "bytea" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_visibility" CHECK ("templates"."visibility" in ('workspace','public')),
	CONSTRAINT "templates_status" CHECK ("templates"."status" in ('published','pending')),
	CONSTRAINT "templates_category" CHECK ("templates"."category" in ('social','print','presentation','cards','other')),
	CONSTRAINT "templates_license" CHECK ("templates"."license" in ('cc0','cc-by','workspace-only')),
	CONSTRAINT "templates_workspace_only" CHECK (("templates"."license" = 'workspace-only') = ("templates"."visibility" = 'workspace')),
	CONSTRAINT "templates_kit" CHECK ("templates"."kit_id" is null or "templates"."visibility" = 'workspace'),
	CONSTRAINT "templates_cc_by" CHECK ("templates"."license" <> 'cc-by' or "templates"."attribution" <> '')
);
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_target_type";--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_kit_id_brand_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."brand_kits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "templates_visibility_created" ON "templates" USING btree ("visibility","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "templates_workspace" ON "templates" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_type" CHECK ("reports"."target_type" in ('asset','shape','template'));