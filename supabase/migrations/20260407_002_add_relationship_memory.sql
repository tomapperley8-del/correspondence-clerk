-- P34: Relationship memory — 3-sentence AI-distilled summary per business
-- Updated after each business-specific insight generation (Haiku call)

ALTER TABLE businesses
  ADD COLUMN relationship_memory TEXT,
  ADD COLUMN relationship_memory_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN businesses.relationship_memory IS 'AI-distilled 3-sentence relationship summary, updated after each business insight generation';
COMMENT ON COLUMN businesses.relationship_memory_updated_at IS 'When relationship_memory was last regenerated';
