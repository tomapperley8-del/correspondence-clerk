-- 20260917_002_member_care_queue_faster.sql
--
-- Applied 2026-09-17. The first member care run timed out (60s MCP limit)
-- reading v_member_care_queue: last_sent_at / last_received_at were computed
-- for all ~850 businesses with an OR/ANY filter no index could serve.
-- They are now computed only for the queued rows (about 80), from the
-- business's own correspondence, via a new composite index. 2.9s -> 0.07s.
-- Linked-business rows are left to the routine's own history read.
--
-- The view body is otherwise identical to 20260917_001; see that file.

CREATE INDEX IF NOT EXISTS idx_correspondence_business_direction_date
  ON public.correspondence (business_id, direction, entry_date DESC);

-- CREATE OR REPLACE VIEW public.v_member_care_queue: as applied, final SELECT is
--   FROM q JOIN businesses b ... with correlated subqueries on
--   correspondence(business_id, direction) for last_sent_at / last_received_at.
