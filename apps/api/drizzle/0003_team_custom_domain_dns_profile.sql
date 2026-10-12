ALTER TABLE "teams"
  ADD COLUMN "custom_domain_cname_target" text,
  ADD COLUMN "custom_domain_txt_record_name" text;
