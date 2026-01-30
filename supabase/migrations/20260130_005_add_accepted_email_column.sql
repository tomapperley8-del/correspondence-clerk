-- Add accepted_email column to invitations table
-- For shareable invite links, this stores the actual email used when accepting
-- (since the original email is a placeholder for shareable links)

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS accepted_email TEXT;

COMMENT ON COLUMN public.invitations.accepted_email IS 'The actual email address used when accepting the invitation (for shareable links where email is not pre-specified)';
