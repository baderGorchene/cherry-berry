CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "reports_target_type" CHECK ("reports"."target_type" in ('asset','shape')),
	CONSTRAINT "reports_reason" CHECK ("reports"."reason" in ('copyright','inappropriate','spam','other')),
	CONSTRAINT "reports_note" CHECK (char_length("reports"."note") <= 500),
	CONSTRAINT "reports_status" CHECK ("reports"."status" in ('open','dismissed','removed'))
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_target_reporter" ON "reports" USING btree ("target_type","target_id","reporter_id");--> statement-breakpoint
CREATE INDEX "reports_target_status" ON "reports" USING btree ("target_type","target_id","status");