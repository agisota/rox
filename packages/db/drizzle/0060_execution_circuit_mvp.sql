CREATE TYPE "public"."trace_event_kind" AS ENUM('state_entered', 'transition_started', 'runtime_invoked', 'output_received', 'validator_passed', 'validator_failed', 'transition_completed', 'transition_failed', 'note');--> statement-breakpoint
CREATE TYPE "public"."transition_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "execution_circuits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"spec" jsonb NOT NULL,
	"status" "transition_run_status" DEFAULT 'pending' NOT NULL,
	"is_draft" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experience_trace_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"transition_run_id" uuid NOT NULL,
	"kind" "trace_event_kind" NOT NULL,
	"payload" jsonb,
	"seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transition_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_circuit_id" uuid NOT NULL,
	"transition_id" text NOT NULL,
	"status" "transition_run_status" DEFAULT 'pending' NOT NULL,
	"compiled_prompt" text,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_definitions" ALTER COLUMN "engine" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ALTER COLUMN "engine" SET DEFAULT 'rox'::text;--> statement-breakpoint
DROP TYPE "public"."workflow_engine";--> statement-breakpoint
CREATE TYPE "public"."workflow_engine" AS ENUM('rox', 'sim_sidecar', 'legacy_automation', 'external_tool');--> statement-breakpoint
ALTER TABLE "workflow_definitions" ALTER COLUMN "engine" SET DEFAULT 'rox'::"public"."workflow_engine";--> statement-breakpoint
ALTER TABLE "workflow_definitions" ALTER COLUMN "engine" SET DATA TYPE "public"."workflow_engine" USING "engine"::"public"."workflow_engine";--> statement-breakpoint
ALTER TABLE "execution_circuits" ADD CONSTRAINT "execution_circuits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_circuits" ADD CONSTRAINT "execution_circuits_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_trace_events" ADD CONSTRAINT "experience_trace_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_trace_events" ADD CONSTRAINT "experience_trace_events_transition_run_id_transition_runs_id_fk" FOREIGN KEY ("transition_run_id") REFERENCES "public"."transition_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transition_runs" ADD CONSTRAINT "transition_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transition_runs" ADD CONSTRAINT "transition_runs_execution_circuit_id_execution_circuits_id_fk" FOREIGN KEY ("execution_circuit_id") REFERENCES "public"."execution_circuits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_circuits_task_uniq" ON "execution_circuits" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "execution_circuits_org_idx" ON "execution_circuits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "experience_trace_events_run_seq_idx" ON "experience_trace_events" USING btree ("transition_run_id","seq");--> statement-breakpoint
CREATE INDEX "experience_trace_events_org_idx" ON "experience_trace_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "transition_runs_circuit_idx" ON "transition_runs" USING btree ("execution_circuit_id");--> statement-breakpoint
CREATE INDEX "transition_runs_org_idx" ON "transition_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "transition_runs_status_idx" ON "transition_runs" USING btree ("status");