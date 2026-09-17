-- 20260918_003_one_prospect_pipeline.sql
--
-- One prospect pipeline instead of two.
--
-- Prospect Leads on /briefing (prospect_leads, written by the outreach routine)
-- and the Outreach board on /todos (businesses.outreach_stage) were separate
-- lists that already disagreed: leads marked contacted whose business still said
-- identified, new leads whose business had been contacted weeks ago.
--
-- The rule now: prospect_leads is the inbox, the outreach board is the pipeline,
-- and a move on either side is mirrored to the other. A lead that becomes a real
-- member drops off both, which the contracts trigger already handles.

CREATE OR REPLACE FUNCTION public.prospect_lead_mirrors_business()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.matched_business_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  -- Approaching them is real pipeline movement; rejecting a lead is a note about
  -- the lead, not about the business, so it is not mirrored.
  IF NEW.status IN ('outreach_planned', 'contacted') THEN
    UPDATE businesses b
    SET outreach_stage = 'contacted',
        outreach_contacted_at = coalesce(b.outreach_contacted_at, current_date)
    WHERE b.id = NEW.matched_business_id
      AND coalesce(b.outreach_stage, 'identified') = 'identified'
      AND NOT (b.is_club_card OR b.is_advertiser);
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS prospect_leads_mirror_business ON public.prospect_leads;
CREATE TRIGGER prospect_leads_mirror_business
  AFTER UPDATE ON public.prospect_leads
  FOR EACH ROW EXECUTE FUNCTION public.prospect_lead_mirrors_business();

CREATE OR REPLACE FUNCTION public.business_stage_mirrors_lead()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.outreach_stage IS NOT DISTINCT FROM OLD.outreach_stage THEN RETURN NULL; END IF;

  IF NEW.outreach_stage IN ('contacted', 'followed_up', 'in_discussion') THEN
    UPDATE prospect_leads l
    SET status = 'contacted'
    WHERE l.matched_business_id = NEW.id AND l.status IN ('new', 'reviewing', 'outreach_planned');
  ELSIF NEW.outreach_stage IS NULL AND (NEW.is_club_card OR NEW.is_advertiser) THEN
    -- They signed: the lead has done its job.
    UPDATE prospect_leads l
    SET status = 'converted'
    WHERE l.matched_business_id = NEW.id AND l.status <> 'converted';
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS businesses_mirror_lead ON public.businesses;
CREATE TRIGGER businesses_mirror_lead
  AFTER UPDATE OF outreach_stage ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.business_stage_mirrors_lead();

-- Backfill the rows that had already drifted apart.
UPDATE businesses b
SET outreach_stage = 'contacted',
    outreach_contacted_at = coalesce(b.outreach_contacted_at, current_date)
FROM prospect_leads l
WHERE l.matched_business_id = b.id
  AND l.status IN ('contacted', 'outreach_planned')
  AND coalesce(b.outreach_stage, 'identified') = 'identified'
  AND NOT (b.is_club_card OR b.is_advertiser);

UPDATE prospect_leads l
SET status = 'contacted'
FROM businesses b
WHERE b.id = l.matched_business_id
  AND l.status IN ('new', 'reviewing')
  AND b.outreach_stage IN ('contacted', 'followed_up', 'in_discussion');

UPDATE prospect_leads l
SET status = 'converted'
FROM businesses b
WHERE b.id = l.matched_business_id
  AND l.status <> 'converted'
  AND (b.is_club_card OR b.is_advertiser);
