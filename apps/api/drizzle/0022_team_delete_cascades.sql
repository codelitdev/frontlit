ALTER TABLE "documentation_git_migration_prs" DROP CONSTRAINT "documentation_git_migration_prs_setup_id_documentation_git_setups_setup_id_fk";
--> statement-breakpoint
ALTER TABLE "site_release_pages" DROP CONSTRAINT "site_release_pages_revision_id_page_revisions_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_migration_prs" ADD CONSTRAINT "documentation_git_migration_prs_setup_id_documentation_git_setups_setup_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."documentation_git_setups"("setup_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site_release_pages" ADD CONSTRAINT "site_release_pages_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
