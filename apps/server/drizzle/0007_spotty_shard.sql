CREATE TABLE "brand_fonts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kit_id" uuid NOT NULL,
	"family" text NOT NULL,
	"weight" integer NOT NULL,
	"style" text NOT NULL,
	"format" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_fonts_style" CHECK ("brand_fonts"."style" in ('normal', 'italic')),
	CONSTRAINT "brand_fonts_format" CHECK ("brand_fonts"."format" in ('woff2', 'woff', 'ttf', 'otf'))
);
--> statement-breakpoint
ALTER TABLE "brand_fonts" ADD CONSTRAINT "brand_fonts_kit_id_brand_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."brand_kits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_fonts" ADD CONSTRAINT "brand_fonts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_fonts_kit" ON "brand_fonts" USING btree ("kit_id");