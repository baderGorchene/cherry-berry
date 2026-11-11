CREATE TABLE "shapes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"workspace_id" uuid,
	"visibility" text NOT NULL,
	"name" text NOT NULL,
	"tags" text[] NOT NULL,
	"d" text NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"fill_rule" text NOT NULL,
	"fill" jsonb,
	"stroke" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shapes_visibility" CHECK ("shapes"."visibility" in ('private','workspace','public')),
	CONSTRAINT "shapes_workspace" CHECK (("shapes"."visibility" = 'workspace') = ("shapes"."workspace_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "shapes" ADD CONSTRAINT "shapes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shapes" ADD CONSTRAINT "shapes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shapes_visibility_created" ON "shapes" USING btree ("visibility","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "shapes_workspace" ON "shapes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "shapes_created_by" ON "shapes" USING btree ("created_by");