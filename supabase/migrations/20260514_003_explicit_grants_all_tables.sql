-- Explicit GRANTs for all public schema tables.
-- Required ahead of Supabase's Oct 30 2026 enforcement of no implicit public schema access.
-- DEFAULT PRIVILEGES ensures any future table automatically gets the same grants.

-- Core app tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses             TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts               TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.correspondence         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations            TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts              TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_threads   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duplicate_dismissals   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_mappings        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_senders        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_queue           TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_queue          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_files         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_membership_types   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_business_types     TO authenticated, service_role;

-- Insights / AI
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_cache          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_history        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_presets        TO authenticated, service_role;

-- System / infra
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits            TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs             TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.temporary_email_data   TO authenticated, service_role;

-- OE (Outreach Engine) tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_business_types      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_prospects           TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_actions             TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_discovery_runs      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_mastersheet_cache   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_business_links      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_pending_matches     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_competitor_ads      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_outreach_events     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_conversion_stats    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_digital_profiles    TO authenticated, service_role;

-- Sequences (needed for INSERT on tables with serial/uuid default columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Default privileges: any future table or sequence created in public schema
-- automatically gets the same grants without needing a separate migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
