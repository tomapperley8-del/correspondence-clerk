ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS briefing_email_opt_out BOOLEAN NOT NULL DEFAULT false;
