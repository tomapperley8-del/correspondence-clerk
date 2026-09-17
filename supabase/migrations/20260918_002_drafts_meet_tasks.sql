-- 20260918_002_drafts_meet_tasks.sql
--
-- Tasks and drafts stop ignoring each other.
--
-- This morning the task engine opened "Chase £250 from BUSBY'S PHARMACY" and an
-- hour later the member care routine wrote that exact chaser into Outlook. The
-- task said nothing about it, and the ✨ Draft button next to it called an AI
-- account with no credit.
--
-- Two halves:
--   1. routine_draft_marks_tasks(): when a routine writes a draft, every open
--      task for that business and that kind of work gets stamped with it, so the
--      app can show "draft waiting in Outlook" instead of a dead button.
--   2. draft_requests: the ✨ button now asks for a draft instead of generating
--      one. The member care routine reads pending requests first thing and
--      writes them in Tom's voice, with the full history behind it.

CREATE TABLE IF NOT EXISTS public.draft_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  requested_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  task_id          uuid REFERENCES tasks(id) ON DELETE SET NULL,
  note             text,          -- what Tom wants the email to do
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','done','held','cancelled')),
  handled_at       timestamptz,
  routine_draft_id uuid REFERENCES routine_drafts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_draft_requests_pending
  ON public.draft_requests (business_id) WHERE status = 'pending';

ALTER TABLE public.draft_requests ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.draft_requests TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.draft_requests TO authenticated;

DROP POLICY IF EXISTS draft_requests_read ON public.draft_requests;
CREATE POLICY draft_requests_read ON public.draft_requests
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS draft_requests_insert ON public.draft_requests;
CREATE POLICY draft_requests_insert ON public.draft_requests
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS draft_requests_update ON public.draft_requests;
CREATE POLICY draft_requests_update ON public.draft_requests
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.draft_requests IS
  'Tom asking a routine for an email. Written by the app (the Draft button), read and cleared by the member care routine next run.';

-- A draft, or a deliberate hold-back, lands on the tasks it answers.
CREATE OR REPLACE FUNCTION public.routine_draft_marks_tasks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.business_id IS NULL THEN RETURN NULL; END IF;

  IF NEW.outcome = 'drafted' THEN
    UPDATE tasks t
    SET signal_meta = coalesce(t.signal_meta, '{}'::jsonb) || jsonb_build_object(
          'draft_at', NEW.created_at,
          'draft_kind', NEW.kind,
          'draft_subject', NEW.subject,
          'draft_recipient', NEW.recipient,
          'draft_id', NEW.id)
    WHERE t.business_id = NEW.business_id
      AND t.status <> 'done'
      AND (
        (NEW.kind = 'overdue'  AND t.signal_key LIKE 'invoice_%')
     OR (NEW.kind = 'renewal'  AND t.signal_key LIKE 'renewal_%')
     OR (NEW.kind = 'checkin'  AND t.signal_key LIKE 'checkin:%')
     OR (NEW.kind = 'outreach' AND t.signal_key LIKE 'prospect:%')
      );

    UPDATE draft_requests r
    SET status = 'done', handled_at = now(), routine_draft_id = NEW.id
    WHERE r.status = 'pending' AND r.business_id = NEW.business_id;

  ELSIF NEW.outcome = 'skipped' THEN
    -- Tom asked for this one, so tell him it was held back rather than leaving
    -- the request sitting there looking unanswered.
    UPDATE draft_requests r
    SET status = 'held', handled_at = now(), routine_draft_id = NEW.id
    WHERE r.status = 'pending' AND r.business_id = NEW.business_id;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS routine_drafts_mark_tasks ON public.routine_drafts;
CREATE TRIGGER routine_drafts_mark_tasks
  AFTER INSERT ON public.routine_drafts
  FOR EACH ROW EXECUTE FUNCTION public.routine_draft_marks_tasks();

-- Stamp the drafts that were already written before this trigger existed.
UPDATE tasks t
SET signal_meta = coalesce(t.signal_meta, '{}'::jsonb) || jsonb_build_object(
      'draft_at', d.created_at, 'draft_kind', d.kind,
      'draft_subject', d.subject, 'draft_recipient', d.recipient, 'draft_id', d.id)
FROM routine_drafts d
WHERE d.outcome = 'drafted'
  AND d.created_at > now() - interval '7 days'
  AND t.business_id = d.business_id
  AND t.status <> 'done'
  AND (
    (d.kind = 'overdue'  AND t.signal_key LIKE 'invoice_%')
 OR (d.kind = 'renewal'  AND t.signal_key LIKE 'renewal_%')
 OR (d.kind = 'checkin'  AND t.signal_key LIKE 'checkin:%')
 OR (d.kind = 'outreach' AND t.signal_key LIKE 'prospect:%')
  );
