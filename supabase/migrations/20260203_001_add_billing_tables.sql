-- Add billing support to organizations table
-- Subscription plans, Stripe integration, and usage limits

-- Subscription plans enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN
    CREATE TYPE public.subscription_plan AS ENUM ('trial', 'pro', 'enterprise');
  END IF;
END
$$;

-- Subscription status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'unpaid');
  END IF;
END
$$;

-- Add billing columns to organizations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS subscription_plan public.subscription_plan DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status DEFAULT 'trialing',
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_email TEXT,
ADD COLUMN IF NOT EXISTS seats_limit INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS ai_requests_limit INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS ai_requests_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_requests_reset_at TIMESTAMPTZ DEFAULT now();

-- Indexes for billing lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON public.organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_organizations_subscription_status ON public.organizations(subscription_status);
CREATE INDEX IF NOT EXISTS idx_organizations_trial_ends_at ON public.organizations(trial_ends_at);

-- Billing events audit table for Stripe webhook events
CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for billing events
CREATE INDEX IF NOT EXISTS idx_billing_events_org ON public.billing_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_event ON public.billing_events(stripe_event_id);

-- RLS for billing_events
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view billing events for their organization"
  ON public.billing_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Add comments for documentation
COMMENT ON COLUMN public.organizations.subscription_plan IS 'Current subscription plan: trial, pro, or enterprise';
COMMENT ON COLUMN public.organizations.subscription_status IS 'Subscription status: trialing, active, past_due, canceled, unpaid';
COMMENT ON COLUMN public.organizations.stripe_customer_id IS 'Stripe customer ID for billing';
COMMENT ON COLUMN public.organizations.stripe_subscription_id IS 'Stripe subscription ID';
COMMENT ON COLUMN public.organizations.trial_ends_at IS 'When the trial period ends';
COMMENT ON COLUMN public.organizations.billing_email IS 'Email for billing notifications';
COMMENT ON COLUMN public.organizations.seats_limit IS 'Maximum number of team members (-1 = unlimited)';
COMMENT ON COLUMN public.organizations.ai_requests_limit IS 'Monthly AI request limit (-1 = unlimited)';
COMMENT ON COLUMN public.organizations.ai_requests_used IS 'AI requests used this billing period';
COMMENT ON COLUMN public.organizations.ai_requests_reset_at IS 'When AI request counter was last reset';
COMMENT ON TABLE public.billing_events IS 'Audit log of Stripe webhook events';

-- RPC function to increment AI usage counter
CREATE OR REPLACE FUNCTION public.increment_ai_usage(org_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.organizations
  SET ai_requests_used = ai_requests_used + 1
  WHERE id = org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
