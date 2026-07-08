-- Feature 4: AI drafts use direction 'outbound' — distinct from 'sent' so a draft
-- never satisfies the needs-reply logic (which checks direction = 'sent').
-- Applied to production via Supabase MCP on 08/07/2026.
ALTER TABLE correspondence DROP CONSTRAINT correspondence_direction_check;
ALTER TABLE correspondence ADD CONSTRAINT correspondence_direction_check
  CHECK (direction = ANY (ARRAY['received'::text, 'sent'::text, 'outbound'::text]));
