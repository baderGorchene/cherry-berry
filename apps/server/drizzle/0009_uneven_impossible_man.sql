CREATE TABLE "design_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"summary" text NOT NULL,
	"state" "bytea" NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"branch_design_id" uuid,
	CONSTRAINT "design_versions_kind" CHECK ("design_versions"."kind" in ('auto','named','restore','branch')),
	CONSTRAINT "design_versions_name" CHECK (char_length("design_versions"."name") <= 80)
);
--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "parent_design_id" uuid;--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "parent_version_id" uuid;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_branch_design_id_designs_id_fk" FOREIGN KEY ("branch_design_id") REFERENCES "public"."designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_versions_design_created" ON "design_versions" USING btree ("design_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_parent_design_id_designs_id_fk" FOREIGN KEY ("parent_design_id") REFERENCES "public"."designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_parent_version_id_design_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."design_versions"("id") ON DELETE set null ON UPDATE no action;