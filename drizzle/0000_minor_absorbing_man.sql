CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type_id" text NOT NULL,
	"group_id" uuid,
	"canonical_name" text NOT NULL,
	"raw_aliases" text[] DEFAULT '{}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_subtotal" boolean DEFAULT false NOT NULL,
	"metric_kind" text DEFAULT 'currency' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid,
	"step" text NOT NULL,
	"model" text,
	"input" jsonb,
	"output" jsonb,
	"status" text NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_values" (
	"period_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"valor_acumulado" numeric NOT NULL,
	"pct_acumulado" numeric,
	"valor_hoy" numeric,
	"pct_hoy" numeric,
	"source" text NOT NULL,
	CONSTRAINT "period_values_period_id_concept_id_pk" PRIMARY KEY("period_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type_id" text NOT NULL,
	"period" date NOT NULL,
	"reference_date" date NOT NULL,
	"pdf_blob_url" text NOT NULL,
	"pdf_filename" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"parser_version" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hotel" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_report_type_id_report_types_id_fk" FOREIGN KEY ("report_type_id") REFERENCES "public"."report_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_group_id_report_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."report_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_values" ADD CONSTRAINT "period_values_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_values" ADD CONSTRAINT "period_values_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_report_type_id_report_types_id_fk" FOREIGN KEY ("report_type_id") REFERENCES "public"."report_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_groups" ADD CONSTRAINT "report_groups_report_type_id_report_types_id_fk" FOREIGN KEY ("report_type_id") REFERENCES "public"."report_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "concepts_type_canonical_uq" ON "concepts" USING btree ("report_type_id","canonical_name");--> statement-breakpoint
CREATE UNIQUE INDEX "periods_type_period_uq" ON "periods" USING btree ("report_type_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "report_groups_type_name_uq" ON "report_groups" USING btree ("report_type_id","name");