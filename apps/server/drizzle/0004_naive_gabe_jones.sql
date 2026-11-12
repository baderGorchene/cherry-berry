CREATE TABLE "asset_uses" (
	"design_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_uses_design_id_asset_id_pk" PRIMARY KEY("design_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "asset_uses" ADD CONSTRAINT "asset_uses_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_uses" ADD CONSTRAINT "asset_uses_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_uses_asset" ON "asset_uses" USING btree ("asset_id");