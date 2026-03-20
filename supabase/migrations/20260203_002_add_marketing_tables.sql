-- Marketing automation tables
-- Supports prospect discovery, referrals, email sequences, and lead capture

-- ================================
-- MARKETING PROSPECTS
-- ================================
-- Stores potential customers discovered via Companies House/Google Places APIs

CREATE TABLE IF NOT EXISTS public.marketing_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_number TEXT UNIQUE,
  company_name TEXT NOT NULL,
  sic_codes TEXT[],
  address JSONB,
  email TEXT,
  phone TEXT,
  website TEXT,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'replied', 'converted', 'rejected', 'unsubscribed')),
  industry TEXT,
  employee_count TEXT,
  notes TEXT,
  contacted_at TIMESTAMPTZ,
  last_email_sent_at TIMESTAMPTZ,
  email_count INTEGER DEFAULT 0,
  smartlead_lead_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for prospect queries
CREATE INDEX IF NOT EXISTS idx_marketing_prospects_status ON public.marketing_prospects(status);
CREATE INDEX IF NOT EXISTS idx_marketing_prospects_score ON public.marketing_prospects(score DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_prospects_sic_codes ON public.marketing_prospects USING GIN(sic_codes);
CREATE INDEX IF NOT EXISTS idx_marketing_prospects_created ON public.marketing_prospects(created_at DESC);

-- ================================
-- REFERRALS
-- ================================
-- Tracks referral codes and conversions for viral growth

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referrer_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  referee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referee_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  referral_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'converted', 'rewarded', 'expired')),
  reward_type TEXT DEFAULT 'free_month',
  referrer_rewarded_at TIMESTAMPTZ,
  referee_rewarded_at TIMESTAMPTZ,
  signed_up_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for referral lookups
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);

-- ================================
-- EMAIL SEQUENCES
-- ================================
-- Defines automated email sequence templates

CREATE TABLE IF NOT EXISTS public.email_sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('trial_started', 'purchase_completed', 'trial_ending', 'referral_signup', 'lead_captured', 'review_request')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual emails within a sequence
CREATE TABLE IF NOT EXISTS public.email_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.email_sequence_templates(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  subject TEXT NOT NULL,
  body_template TEXT NOT NULL,
  goal TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, step_number)
);

-- Tracks users enrolled in sequences
CREATE TABLE IF NOT EXISTS public.email_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.email_sequence_templates(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'unsubscribed')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_email_sent_at TIMESTAMPTZ,
  next_email_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- Index for sequence processing
CREATE INDEX IF NOT EXISTS idx_enrollments_next_email ON public.email_sequence_enrollments(next_email_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON public.email_sequence_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_template ON public.email_sequence_enrollments(template_id);

-- Email send log
CREATE TABLE IF NOT EXISTS public.email_sequence_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.email_sequence_enrollments(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.email_sequence_steps(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sendgrid_message_id TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sequence_sends_enrollment ON public.email_sequence_sends(enrollment_id);

-- ================================
-- LEADS (from chatbot, free tools, etc.)
-- ================================

CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  phone TEXT,
  source TEXT NOT NULL CHECK (source IN ('chatbot', 'email_cleaner', 'letter_templates', 'blog', 'landing_page', 'referral', 'other')),
  industry TEXT,
  company_size TEXT,
  notes TEXT,
  qualified BOOLEAN DEFAULT false,
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'nurturing', 'converted', 'rejected')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  converted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON public.marketing_leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.marketing_leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.marketing_leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON public.marketing_leads(created_at DESC);

-- ================================
-- SOCIAL CONTENT SCHEDULE
-- ================================

CREATE TABLE IF NOT EXISTS public.social_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'twitter', 'both')),
  content TEXT NOT NULL,
  content_type TEXT CHECK (content_type IN ('tip', 'feature', 'story', 'news', 'promo')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  posted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'posted', 'failed', 'cancelled')),
  linkedin_post_id TEXT,
  twitter_post_id TEXT,
  engagement_linkedin JSONB,
  engagement_twitter JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_content_scheduled ON public.social_content(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_content_platform ON public.social_content(platform);

-- ================================
-- BLOG POSTS
-- ================================

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  meta_description TEXT,
  meta_keywords TEXT[],
  industry TEXT,
  featured_image_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  author TEXT DEFAULT 'Correspondence Clerk Team',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON public.blog_posts(published_at DESC) WHERE status = 'published';

-- ================================
-- REVIEW REQUESTS
-- ================================

CREATE TABLE IF NOT EXISTS public.review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('g2', 'capterra', 'trustpilot', 'google')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  review_url TEXT,
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'reminded', 'completed', 'declined'))
);

CREATE INDEX IF NOT EXISTS idx_review_requests_user ON public.review_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON public.review_requests(status);

-- ================================
-- CHATBOT CONVERSATIONS
-- ================================

CREATE TABLE IF NOT EXISTS public.chatbot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  visitor_id TEXT,
  messages JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended', 'converted')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_visitor ON public.chatbot_conversations(visitor_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_lead ON public.chatbot_conversations(lead_id);

-- ================================
-- RLS POLICIES
-- ================================
-- Marketing tables are admin-only (no user access needed)

ALTER TABLE public.marketing_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_conversations ENABLE ROW LEVEL SECURITY;

-- Public read access to blog posts (published only)
CREATE POLICY "Anyone can read published blog posts"
  ON public.blog_posts
  FOR SELECT
  USING (status = 'published');

-- Users can view their own referral info
CREATE POLICY "Users can view their own referrals"
  ON public.referrals
  FOR SELECT
  USING (referrer_user_id = auth.uid() OR referee_user_id = auth.uid());

-- Users can view their own review requests
CREATE POLICY "Users can view their own review requests"
  ON public.review_requests
  FOR SELECT
  USING (user_id = auth.uid());

-- Service role has full access (for cron jobs)
-- Note: Service role bypasses RLS by default

-- ================================
-- FUNCTIONS
-- ================================

-- Generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists_count INTEGER;
BEGIN
  LOOP
    code := upper(substring(md5(random()::text) from 1 for 8));
    SELECT COUNT(*) INTO exists_count FROM public.referrals WHERE referral_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Get user's referral code (creates one if doesn't exist)
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(p_user_id UUID, p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  existing_code TEXT;
  new_code TEXT;
BEGIN
  -- Check for existing referral
  SELECT referral_code INTO existing_code
  FROM public.referrals
  WHERE referrer_user_id = p_user_id
  AND status = 'pending'
  LIMIT 1;

  IF existing_code IS NOT NULL THEN
    RETURN existing_code;
  END IF;

  -- Create new referral code
  new_code := public.generate_referral_code();

  INSERT INTO public.referrals (referrer_user_id, referrer_organization_id, referral_code)
  VALUES (p_user_id, p_org_id, new_code);

  RETURN new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON TABLE public.marketing_prospects IS 'Potential customers discovered via APIs (Companies House, Google Places)';
COMMENT ON TABLE public.referrals IS 'Referral codes and conversion tracking for viral growth';
COMMENT ON TABLE public.email_sequence_templates IS 'Automated email sequence definitions';
COMMENT ON TABLE public.email_sequence_steps IS 'Individual emails within a sequence';
COMMENT ON TABLE public.email_sequence_enrollments IS 'Users enrolled in email sequences';
COMMENT ON TABLE public.marketing_leads IS 'Leads captured from chatbot, free tools, etc.';
COMMENT ON TABLE public.social_content IS 'Scheduled social media posts';
COMMENT ON TABLE public.blog_posts IS 'Auto-generated blog content';
COMMENT ON TABLE public.review_requests IS 'Review solicitation tracking';
COMMENT ON TABLE public.chatbot_conversations IS 'AI chatbot conversation history';
