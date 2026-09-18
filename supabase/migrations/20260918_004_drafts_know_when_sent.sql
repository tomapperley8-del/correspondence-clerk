-- 20260918_004_drafts_know_when_sent.sql
--
-- A draft knows when Tom has sent it, and when they have answered.
--
-- On 17 Sep Tom sent the Fudge's, Oddono's and FS8 drafts within minutes, and
-- Oddono's replied. The app kept listing all three as "waiting in Outlook" and
-- the Fudge's task kept saying "Draft waiting". Every draft carries
-- info-utbz@correspondenceclerk.com in BCC, so the sent email files itself into
-- correspondence with the same subject: that is the signal.
--
-- Also: a deliberate hold-back now lands on its task too, so the task says
-- "Held back until 1 Oct" with the reason, instead of inviting Tom to ask for
-- the very draft the routine chose not to write.

ALTER TABLE public.routine_drafts
  ADD COLUMN IF NOT EXISTS sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

-- Subject with any Re:/Fw: prefixes removed, for matching a sent email or a
-- reply back to the draft it came from.
CREATE OR REPLACE FUNCTION public.bare_subject(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(regexp_replace(coalesce(s, ''), '^(\s*(re|fw|fwd|aw)\s*:\s*)+', '', 'i')))
$$;

CREATE OR REPLACE FUNCTION public.correspondence_marks_routine_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  d record;
BEGIN
  IF NEW.subject IS NULL OR NEW.business_id IS NULL THEN RETURN NULL; END IF;

  IF NEW.direction = 'sent' THEN
    FOR d IN
      UPDATE routine_drafts r
      SET sent_at = coalesce(r.sent_at, NEW.entry_date)
      WHERE r.outcome = 'drafted'
        AND r.sent_at IS NULL
        AND r.business_id = NEW.business_id
        AND r.created_at > NEW.entry_date - interval '30 days'
        AND bare_subject(r.subject) = bare_subject(NEW.subject)
      RETURNING r.id
    LOOP
      UPDATE tasks t
      SET signal_meta = t.signal_meta || jsonb_build_object('draft_sent_at', NEW.entry_date)
      WHERE t.signal_meta->>'draft_id' = d.id::text;
    END LOOP;

  ELSIF NEW.direction = 'received' THEN
    UPDATE routine_drafts r
    SET replied_at = coalesce(r.replied_at, NEW.entry_date)
    WHERE r.outcome = 'drafted'
      AND r.replied_at IS NULL
      AND r.business_id = NEW.business_id
      AND r.created_at > NEW.entry_date - interval '60 days'
      AND bare_subject(r.subject) = bare_subject(NEW.subject);
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS correspondence_marks_routine_draft ON public.correspondence;
CREATE TRIGGER correspondence_marks_routine_draft
  AFTER INSERT ON public.correspondence
  FOR EACH ROW EXECUTE FUNCTION public.correspondence_marks_routine_draft();

-- Hold-backs stamp their tasks as well.
CREATE OR REPLACE FUNCTION public.routine_draft_marks_tasks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.business_id IS NULL THEN RETURN NULL; END IF;

  IF NEW.outcome = 'drafted' THEN
    UPDATE tasks t
    SET signal_meta = (coalesce(t.signal_meta, '{}'::jsonb) - 'held_until' - 'held_reason') || jsonb_build_object(
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
    UPDATE tasks t
    SET signal_meta = coalesce(t.signal_meta, '{}'::jsonb) || jsonb_build_object(
          'held_until', NEW.snooze_until,
          'held_reason', NEW.reason)
    WHERE t.business_id = NEW.business_id
      AND t.status <> 'done'
      AND NOT (coalesce(t.signal_meta, '{}'::jsonb) ? 'draft_at')
      AND (
        (NEW.kind = 'overdue'  AND t.signal_key LIKE 'invoice_%')
     OR (NEW.kind = 'renewal'  AND t.signal_key LIKE 'renewal_%')
     OR (NEW.kind = 'checkin'  AND t.signal_key LIKE 'checkin:%')
     OR (NEW.kind = 'outreach' AND t.signal_key LIKE 'prospect:%')
      );

    UPDATE draft_requests r
    SET status = 'held', handled_at = now(), routine_draft_id = NEW.id
    WHERE r.status = 'pending' AND r.business_id = NEW.business_id;
  END IF;

  RETURN NULL;
END $$;

-- Backfill: drafts already sent or answered.
UPDATE routine_drafts r
SET sent_at = s.first_sent
FROM (
  SELECT r2.id, min(c.entry_date) AS first_sent
  FROM routine_drafts r2
  JOIN correspondence c ON c.business_id = r2.business_id
   AND c.direction = 'sent'
   AND c.entry_date > r2.created_at - interval '1 hour'
   AND bare_subject(c.subject) = bare_subject(r2.subject)
  WHERE r2.outcome = 'drafted'
  GROUP BY r2.id
) s
WHERE s.id = r.id AND r.sent_at IS NULL;

UPDATE routine_drafts r
SET replied_at = s.first_reply
FROM (
  SELECT r2.id, min(c.entry_date) AS first_reply
  FROM routine_drafts r2
  JOIN correspondence c ON c.business_id = r2.business_id
   AND c.direction = 'received'
   AND c.entry_date > r2.created_at
   AND bare_subject(c.subject) = bare_subject(r2.subject)
  WHERE r2.outcome = 'drafted'
  GROUP BY r2.id
) s
WHERE s.id = r.id AND r.replied_at IS NULL;

UPDATE tasks t
SET signal_meta = t.signal_meta || jsonb_build_object('draft_sent_at', r.sent_at)
FROM routine_drafts r
WHERE r.sent_at IS NOT NULL AND t.signal_meta->>'draft_id' = r.id::text;

-- Backfill: current hold-backs onto their tasks.
UPDATE tasks t
SET signal_meta = coalesce(t.signal_meta, '{}'::jsonb) || jsonb_build_object(
      'held_until', r.snooze_until, 'held_reason', r.reason)
FROM routine_drafts r
WHERE r.outcome = 'skipped'
  AND r.snooze_until >= current_date
  AND t.business_id = r.business_id
  AND t.status <> 'done'
  AND NOT (coalesce(t.signal_meta, '{}'::jsonb) ? 'draft_at')
  AND (
    (r.kind = 'overdue'  AND t.signal_key LIKE 'invoice_%')
 OR (r.kind = 'renewal'  AND t.signal_key LIKE 'renewal_%')
 OR (r.kind = 'checkin'  AND t.signal_key LIKE 'checkin:%')
 OR (r.kind = 'outreach' AND t.signal_key LIKE 'prospect:%')
  );
