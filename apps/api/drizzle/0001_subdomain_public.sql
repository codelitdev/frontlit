ALTER TABLE "teams" ADD COLUMN "subdomain_public" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "custom_domain_txt_satisfied" boolean;
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "custom_domain_routing_satisfied" boolean;
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_custom_domain_state_check";
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_custom_domain_state_check" CHECK ((
                ("custom_domain" IS NULL
                    AND "custom_domain_status" IS NULL
                    AND "custom_domain_verification_token" IS NULL
                    AND "custom_domain_verified_at" IS NULL
                    AND "custom_domain_txt_satisfied" IS NULL
                    AND "custom_domain_routing_satisfied" IS NULL)
                OR
                ("custom_domain" IS NOT NULL
                    AND "custom_domain_status" IS NOT NULL
                    AND "custom_domain_verification_token" IS NOT NULL
                    AND ("custom_domain_status" <> 'verified' OR "custom_domain_verified_at" IS NOT NULL))
            ));
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_subdomain_public_check" CHECK ("subdomain_public" = true OR "custom_domain_status" = 'verified');
