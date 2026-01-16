-- ==================== MIGRATION 6: ADD DIRECTION COLUMN ====================
-- Adds direction field to track if correspondence was sent or received

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS direction TEXT
  CHECK (direction IN ('received', 'sent'));

CREATE INDEX IF NOT EXISTS idx_correspondence_direction
  ON public.correspondence(direction)
  WHERE direction IS NOT NULL;

COMMENT ON COLUMN public.correspondence.direction IS
  'Direction of correspondence: received (from contact to us) or sent (from us to contact)';
