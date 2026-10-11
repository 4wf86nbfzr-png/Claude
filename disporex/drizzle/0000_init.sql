CREATE TYPE "public"."role_key" AS ENUM('tenant_admin', 'dispatcher', 'operations_lead', 'hr', 'accounting', 'customer', 'partner', 'employee');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'invited', 'locked', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."availability_kind" AS ENUM('available', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'inactive', 'applicant', 'left');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('lead', 'active', 'inactive', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'planned', 'confirmed', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'offered', 'confirmed', 'changed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."request_source" AS ENUM('manual', 'api', 'email', 'portal', 'ai_draft');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('new', 'in_review', 'needs_info', 'quoted', 'accepted', 'declined', 'converted', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('open', 'requested', 'accepted', 'declined', 'no_response', 'confirmed', 'withdrawn', 'replaced', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."partner_offer_status" AS ENUM('offered', 'accepted', 'partially_accepted', 'declined', 'withdrawn', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_kind" AS ENUM('match', 'deviation', 'missing_record', 'unplanned_record');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('open', 'approved', 'rejected', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."time_record_status" AS ENUM('raw', 'matched', 'unmatched', 'reviewed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."document_entity_type" AS ENUM('employee', 'customer', 'partner', 'event', 'tenant', 'request', 'time_import');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'delivered', 'failed', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'read', 'skipped');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" uuid,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"rotated_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_user_id" uuid,
	"actor_api_key_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"request_id" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role_key" NOT NULL,
	"employee_id" uuid,
	"customer_id" uuid,
	"partner_id" uuid,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role_key" NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"employee_id" uuid,
	"customer_id" uuid,
	"partner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "role_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "role_key" NOT NULL,
	"permission" text NOT NULL,
	"allowed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"tenant_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"reauth_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"is_system_admin" boolean DEFAULT false NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"sessions_invalid_before" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" "availability_kind" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" text DEFAULT 'note' NOT NULL,
	"body" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"qualification_id" uuid NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"document_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_number" text NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"city" text,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"employment_type" text,
	"areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"org_notes" text,
	"deactivated_at" timestamp with time zone,
	"retain_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"expires" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_number" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"email" text,
	"phone" text,
	"website" text,
	"billing_address" jsonb,
	"billing_email" text,
	"vat_id" text,
	"payment_terms_days" text,
	"requirements" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"name" text NOT NULL,
	"street" text,
	"zip" text,
	"city" text,
	"country" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"status" "request_status" DEFAULT 'new' NOT NULL,
	"source" "request_source" DEFAULT 'manual' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"location_text" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"headcount" integer,
	"requested_roles" jsonb,
	"missing_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"raw_payload" jsonb,
	"dedupe_hash" text,
	"duplicate_of_id" uuid,
	"external_ref" text,
	"ai_extraction" jsonb,
	"converted_event_id" uuid,
	"assigned_user_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"location_id" uuid,
	"contact_id" uuid,
	"request_id" uuid,
	"name" text NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"setup_starts_at" timestamp with time zone,
	"teardown_ends_at" timestamp with time zone,
	"dresscode" text,
	"briefing" text,
	"meeting_point" text,
	"special_notes" text,
	"internal_notes" text,
	"billing_notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"event_id" uuid,
	"request_id" uuid,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"notes" text,
	"released_to_customer_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"headcount_required" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"required_qualification_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"dresscode" text,
	"notes" text,
	"billing_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"from_status" "shift_status",
	"to_status" "shift_status" NOT NULL,
	"employee_id" uuid,
	"actor_user_id" uuid,
	"actor_label" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"employee_id" uuid,
	"partner_id" uuid,
	"partner_staff_name" text,
	"status" "shift_status" DEFAULT 'open' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone,
	"response_deadline_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"conflict_override_reason" text,
	"conflict_override_by" uuid,
	"conflict_override_at" timestamp with time zone,
	"replaced_by_shift_id" uuid,
	"released_to_employee_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"headcount_requested" integer NOT NULL,
	"headcount_committed" integer DEFAULT 0 NOT NULL,
	"status" "partner_offer_status" DEFAULT 'offered' NOT NULL,
	"share_briefing" boolean DEFAULT true NOT NULL,
	"message" text,
	"response_note" text,
	"responded_at" timestamp with time zone,
	"responded_by" uuid,
	"offered_by" uuid,
	"deadline_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"email" text,
	"phone" text,
	"city" text,
	"qualification_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"compliance_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shift_id" uuid,
	"time_record_id" uuid,
	"employee_id" uuid,
	"kind" "reconciliation_kind" NOT NULL,
	"status" "reconciliation_status" DEFAULT 'open' NOT NULL,
	"planned_start" timestamp with time zone,
	"planned_end" timestamp with time zone,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"deviation_minutes" integer DEFAULT 0 NOT NULL,
	"approved_start" timestamp with time zone,
	"approved_end" timestamp with time zone,
	"approved_break_minutes" integer,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reconciliation_item_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"filename" text NOT NULL,
	"format" text NOT NULL,
	"file_hash" text NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"column_mapping" jsonb,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "time_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"import_id" uuid,
	"employee_id" uuid,
	"employee_number_raw" text NOT NULL,
	"shift_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'import' NOT NULL,
	"status" time_record_status DEFAULT 'raw' NOT NULL,
	"row_hash" text NOT NULL,
	"raw" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" "document_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"title" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_version_id" uuid,
	"confidentiality" text DEFAULT 'internal' NOT NULL,
	"expires_at" date,
	"reminder_sent_at" timestamp with time zone,
	"uploaded_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"retain_until" date,
	"scanned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"entity_type" text,
	"entity_id" uuid,
	"error" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" text NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_runs_per_hour" integer DEFAULT 100 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"domain_event_id" uuid,
	"status" text NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dedupe_key" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"payload" jsonb NOT NULL,
	"actor_user_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"subject" text,
	"body_text" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"customer_id" uuid,
	"request_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"dedupe_key" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"recipient_address" text,
	"channel" "notification_channel" NOT NULL,
	"priority" "notification_priority" DEFAULT 'normal' NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dedupe_key" text,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"domain_event_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_status_code" integer,
	"last_error" text,
	"last_response_snippet" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"event_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_by" uuid,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"rate_card_id" uuid,
	"billing_category" text,
	"planned_minutes" integer NOT NULL,
	"approved_minutes" integer,
	"hourly_rate_cents" integer NOT NULL,
	"surcharge_cents" integer DEFAULT 0 NOT NULL,
	"surcharge_details" jsonb,
	"total_cents" integer NOT NULL,
	"status" text DEFAULT 'preliminary' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"billing_category" text,
	"label" text NOT NULL,
	"hourly_rate_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surcharge_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"percent" integer NOT NULL,
	"from_time" text,
	"to_time" text,
	"holidays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission_overrides" ADD CONSTRAINT "role_permission_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_notes" ADD CONSTRAINT "employee_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_notes" ADD CONSTRAINT "employee_notes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_qualifications" ADD CONSTRAINT "employee_qualifications_qualification_id_qualifications_id_fk" FOREIGN KEY ("qualification_id") REFERENCES "public"."qualifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_requests" ADD CONSTRAINT "customer_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_requests" ADD CONSTRAINT "customer_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_requests" ADD CONSTRAINT "customer_requests_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_changes" ADD CONSTRAINT "event_changes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_changes" ADD CONSTRAINT "event_changes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_contact_id_customer_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."customer_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_request_id_customer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."customer_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_request_id_customer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."customer_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_status_history" ADD CONSTRAINT "shift_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_status_history" ADD CONSTRAINT "shift_status_history_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_time_record_id_time_records_id_fk" FOREIGN KEY ("time_record_id") REFERENCES "public"."time_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD CONSTRAINT "time_corrections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD CONSTRAINT "time_corrections_reconciliation_item_id_reconciliation_items_id_fk" FOREIGN KEY ("reconciliation_item_id") REFERENCES "public"."reconciliation_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_imports" ADD CONSTRAINT "time_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_records" ADD CONSTRAINT "time_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_records" ADD CONSTRAINT "time_records_import_id_time_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."time_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_records" ADD CONSTRAINT "time_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_records" ADD CONSTRAINT "time_records_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_tokens" ADD CONSTRAINT "document_access_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_tokens" ADD CONSTRAINT "document_access_tokens_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surcharge_rules" ADD CONSTRAINT "surcharge_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_tenant_key_idx" ON "idempotency_keys" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_user_idx" ON "memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_overrides_unique" ON "role_permission_overrides" USING btree ("tenant_id","role","permission");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "availabilities_employee_time_idx" ON "availabilities" USING btree ("tenant_id","employee_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "employee_notes_employee_idx" ON "employee_notes" USING btree ("employee_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_qualifications_unique" ON "employee_qualifications" USING btree ("employee_id","qualification_id");--> statement-breakpoint
CREATE INDEX "employee_qualifications_tenant_valid_idx" ON "employee_qualifications" USING btree ("tenant_id","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_number_idx" ON "employees" USING btree ("tenant_id","employee_number");--> statement-breakpoint
CREATE INDEX "employees_tenant_status_idx" ON "employees" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "employees_tenant_name_idx" ON "employees" USING btree ("tenant_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "qualifications_tenant_key_idx" ON "qualifications" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "customer_contacts_customer_idx" ON "customer_contacts" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_number_idx" ON "customers" USING btree ("tenant_id","customer_number");--> statement-breakpoint
CREATE INDEX "customers_tenant_name_idx" ON "customers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "locations_tenant_idx" ON "locations" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "customer_requests_tenant_status_idx" ON "customer_requests" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "customer_requests_dedupe_idx" ON "customer_requests" USING btree ("tenant_id","dedupe_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_requests_external_ref_idx" ON "customer_requests" USING btree ("tenant_id","external_ref");--> statement-breakpoint
CREATE INDEX "event_changes_event_idx" ON "event_changes" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "events_tenant_time_idx" ON "events" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_tenant_customer_idx" ON "events" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "events_tenant_status_idx" ON "events" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_number_idx" ON "orders" USING btree ("tenant_id","order_number");--> statement-breakpoint
CREATE INDEX "orders_tenant_customer_idx" ON "orders" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "positions_event_idx" ON "positions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "positions_tenant_time_idx" ON "positions" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "shift_status_history_shift_idx" ON "shift_status_history" USING btree ("shift_id","created_at");--> statement-breakpoint
CREATE INDEX "shifts_tenant_time_idx" ON "shifts" USING btree ("tenant_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "shifts_employee_time_idx" ON "shifts" USING btree ("tenant_id","employee_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "shifts_position_idx" ON "shifts" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "shifts_tenant_status_idx" ON "shifts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "partner_contacts_partner_idx" ON "partner_contacts" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_offers_partner_idx" ON "partner_offers" USING btree ("tenant_id","partner_id","status");--> statement-breakpoint
CREATE INDEX "partner_offers_position_idx" ON "partner_offers" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "partners_tenant_idx" ON "partners" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_shift_idx" ON "reconciliation_items" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "reconciliation_tenant_status_idx" ON "reconciliation_items" USING btree ("tenant_id","status","kind");--> statement-breakpoint
CREATE INDEX "time_corrections_item_idx" ON "time_corrections" USING btree ("reconciliation_item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "time_imports_tenant_ref_idx" ON "time_imports" USING btree ("tenant_id","reference");--> statement-breakpoint
CREATE INDEX "time_imports_tenant_hash_idx" ON "time_imports" USING btree ("tenant_id","file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "time_records_tenant_rowhash_idx" ON "time_records" USING btree ("tenant_id","row_hash");--> statement-breakpoint
CREATE INDEX "time_records_employee_time_idx" ON "time_records" USING btree ("tenant_id","employee_id","started_at");--> statement-breakpoint
CREATE INDEX "time_records_import_idx" ON "time_records" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "documents_entity_idx" ON "documents" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "documents_expiry_idx" ON "documents" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX "ai_requests_tenant_idx" ON "ai_requests" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_rules_tenant_trigger_idx" ON "automation_rules" USING btree ("tenant_id","trigger","enabled");--> statement-breakpoint
CREATE INDEX "automation_runs_rule_idx" ON "automation_runs" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_dedupe_idx" ON "automation_runs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "domain_events_unprocessed_idx" ON "domain_events" USING btree ("processed_at","created_at");--> statement-breakpoint
CREATE INDEX "domain_events_tenant_type_idx" ON "domain_events" USING btree ("tenant_id","type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_emails_message_idx" ON "inbound_emails" USING btree ("tenant_id","message_id");--> statement-breakpoint
CREATE INDEX "inbound_emails_status_idx" ON "inbound_emails" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "jobs_poll_idx" ON "jobs" USING btree ("status","run_at","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_idx" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_unique" ON "notification_preferences" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("tenant_id","user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("tenant_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_idx" ON "webhook_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_tenant_idx" ON "webhook_endpoints" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_items_shift_idx" ON "billing_items" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "billing_items_customer_idx" ON "billing_items" USING btree ("tenant_id","customer_id","status");--> statement-breakpoint
CREATE INDEX "rate_cards_lookup_idx" ON "rate_cards" USING btree ("tenant_id","customer_id","billing_category","valid_from");--> statement-breakpoint
CREATE INDEX "surcharge_rules_tenant_idx" ON "surcharge_rules" USING btree ("tenant_id","kind");