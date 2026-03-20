-- Add 'Email Thread' to entry_type enum
-- Also add thread_participants column for freeform "who it's between" text

ALTER TYPE public.entry_type ADD VALUE IF NOT EXISTS 'Email Thread';

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS thread_participants TEXT;

COMMENT ON COLUMN public.correspondence.thread_participants IS 'Freeform text describing who the email thread is between (used with type=Email Thread)';
