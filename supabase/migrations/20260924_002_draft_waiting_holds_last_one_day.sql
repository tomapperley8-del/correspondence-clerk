-- 20260924_002_draft_waiting_holds_last_one_day.sql
--
-- "A draft is already waiting" is not a reason to go quiet for a fortnight.
-- On 18 Sep the routine found older renewal drafts for Garment Spa, My Place,
-- Killik and CA Japanese Pancakes in Outlook and held all four until 2 Oct. Only
-- CA Japanese Pancakes was ever sent; the other three drafts vanished and those
-- renewals sat unchased, My Place's term ending on 1 Oct. Such a hold now lasts
-- one day, so the next morning's run checks again whether the draft was sent.
CREATE OR REPLACE FUNCTION public.cap_draft_waiting_hold()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.outcome = 'skipped'
     AND NEW.kind IN ('renewal', 'overdue')
     AND NEW.reason ~* 'draft.{0,20}(already )?(waiting|in (the )?drafts)'
     AND (NEW.snooze_until IS NULL OR NEW.snooze_until > current_date + 1) THEN
    NEW.snooze_until := current_date + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS routine_drafts_cap_draft_waiting_hold ON public.routine_drafts;
CREATE TRIGGER routine_drafts_cap_draft_waiting_hold
  BEFORE INSERT ON public.routine_drafts
  FOR EACH ROW EXECUTE FUNCTION public.cap_draft_waiting_hold();

-- Release the holds already in place for drafts that were never sent.
UPDATE routine_drafts d
SET snooze_until = current_date - 1
WHERE d.outcome = 'skipped'
  AND d.kind IN ('renewal', 'overdue')
  AND d.snooze_until >= current_date
  AND d.reason ~* 'draft.{0,20}(already )?(waiting|in (the )?drafts)'
  AND NOT EXISTS (SELECT 1 FROM correspondence c
                  WHERE c.business_id = d.business_id AND c.direction = 'sent'
                    AND c.entry_date > d.created_at);
