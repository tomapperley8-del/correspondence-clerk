-- blocked_senders was created directly in production without a migration file.
-- This recreates it idempotently so dev environments can be bootstrapped cleanly.
-- Must be dated before 20260415_001 which runs ALTER TABLE on this table.

CREATE TABLE IF NOT EXISTS public.blocked_senders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, email)
);

ALTER TABLE public.blocked_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read blocked_senders"   ON public.blocked_senders;
DROP POLICY IF EXISTS "Org members can insert blocked_senders" ON public.blocked_senders;
DROP POLICY IF EXISTS "Org members can delete blocked_senders" ON public.blocked_senders;

CREATE POLICY "Org members can read blocked_senders"
  ON public.blocked_senders FOR SELECT TO authenticated
  USING (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Org members can insert blocked_senders"
  ON public.blocked_senders FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Org members can delete blocked_senders"
  ON public.blocked_senders FOR DELETE TO authenticated
  USING (org_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));
