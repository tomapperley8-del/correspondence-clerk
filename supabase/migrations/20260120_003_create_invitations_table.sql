-- Create invitations table
-- Manages email invitations for users to join organizations

CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Prevent duplicate pending invitations for the same email to the same organization
CREATE UNIQUE INDEX idx_invitations_unique_pending
  ON public.invitations(organization_id, email)
  WHERE status = 'pending';

-- Create indexes for common queries
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_organization_id ON public.invitations(organization_id);
CREATE INDEX idx_invitations_status ON public.invitations(status);
CREATE INDEX idx_invitations_email ON public.invitations(email);

-- Add trigger to update updated_at
CREATE TRIGGER update_invitations_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.invitations IS 'Email invitations for users to join organizations. Tokens are 256-bit (64 hex chars) and expire after 7 days.';
COMMENT ON COLUMN public.invitations.token IS 'Cryptographically secure 256-bit token (64 hex characters)';
COMMENT ON COLUMN public.invitations.expires_at IS 'Token expiration timestamp (7 days from creation)';
COMMENT ON COLUMN public.invitations.status IS 'Invitation status: pending, accepted, expired, or cancelled';
COMMENT ON COLUMN public.invitations.invited_by IS 'User who sent the invitation';
COMMENT ON COLUMN public.invitations.accepted_by IS 'User who accepted the invitation (may differ from invited email initially)';
