ALTER TABLE "assets" ADD COLUMN "sanitized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "reviewed_at" timestamp with time zone;