DROP INDEX "subscriptions_stripe_customer_id_idx";--> statement-breakpoint
ALTER TABLE "payment_attributions" ALTER COLUMN "provider" SET DEFAULT 'dvnet';--> statement-breakpoint
ALTER TABLE "auth"."organizations" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "stripe_schedule_id";