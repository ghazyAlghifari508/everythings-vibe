ALTER TABLE "subscriptions" ADD COLUMN "credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "credits_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill: grant lifetime credits to existing users based on their current plan.
UPDATE "subscriptions" SET "credits" = CASE "plan"
  WHEN 'hengker' THEN 35
  WHEN 'pro' THEN 10
  ELSE 2
END WHERE "credits" = 0;--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "subscription_type";
