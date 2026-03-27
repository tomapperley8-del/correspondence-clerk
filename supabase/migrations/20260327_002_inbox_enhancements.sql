-- Inbox enhancements: store direction, recipients, and full body in queue

ALTER TABLE public.inbound_queue
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'received'
    CHECK (direction IN ('received', 'sent')),
  ADD COLUMN IF NOT EXISTS to_emails JSONB,   -- [{name, email}] from To+Cc headers
  ADD COLUMN IF NOT EXISTS body_text TEXT;    -- full stripped body for UI display

-- Let users register their own email addresses (for forwarded-sent detection)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS own_email_addresses TEXT[] DEFAULT '{}';
