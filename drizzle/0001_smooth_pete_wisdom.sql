DROP INDEX "concepts_type_canonical_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "concepts_type_group_canonical_uq" ON "concepts" USING btree ("report_type_id","group_id","canonical_name");