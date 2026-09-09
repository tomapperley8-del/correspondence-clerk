-- 20260909_003_correspondence_stage_trigger.sql
--
-- Keeps the kanban stages current as correspondence arrives, so the board is
-- right the moment an email syncs rather than after a nightly job.
--
-- Row-level AFTER trigger on correspondence, fired only when a column the
-- derivation actually reads has changed. It recomputes every business the row
-- touches — business_id plus linked_business_ids, on both the old and new
-- version of the row, so moving or re-linking an entry corrects the business
-- it left as well as the one it joined.
--
-- The write policy is identical to the backfill: a NULL stage back from
-- derive_business_stages() means "leave this business alone", and date columns
-- for other stages are preserved.
--
-- No recursion risk: this writes to businesses, never to correspondence.
--
-- SECURITY INVOKER is deliberate. RLS on businesses is org-scoped for
-- `authenticated`, and the inbound-email webhook runs as service_role which
-- bypasses RLS, so both paths behave correctly without granting the trigger
-- more reach than the caller already has.

CREATE OR REPLACE FUNCTION public.apply_derived_stages(p_business_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE businesses b
  SET
    outreach_stage            = coalesce(d.outreach_stage,            b.outreach_stage),
    outreach_identified_at    = coalesce(d.outreach_identified_at,    b.outreach_identified_at),
    outreach_contacted_at     = coalesce(d.outreach_contacted_at,     b.outreach_contacted_at),
    outreach_followed_up_at   = coalesce(d.outreach_followed_up_at,   b.outreach_followed_up_at),
    outreach_in_discussion_at = coalesce(d.outreach_in_discussion_at, b.outreach_in_discussion_at),
    outreach_invoice_paid_at  = coalesce(d.outreach_invoice_paid_at,  b.outreach_invoice_paid_at),
    renewal_stage             = coalesce(d.renewal_stage,             b.renewal_stage),
    renewal_not_started_at    = coalesce(d.renewal_not_started_at,    b.renewal_not_started_at),
    renewal_contacted_at      = coalesce(d.renewal_contacted_at,      b.renewal_contacted_at),
    renewal_in_discussion_at  = coalesce(d.renewal_in_discussion_at,  b.renewal_in_discussion_at)
  -- The UPDATE target cannot be lateral-referenced from its own FROM clause,
  -- so the derivation is materialised against a second scan of businesses.
  FROM (
    SELECT x.id AS business_id, dd.*
    FROM businesses x
    CROSS JOIN LATERAL derive_business_stages(x.id) dd
    WHERE x.id = ANY (p_business_ids)
  ) d
  WHERE b.id = d.business_id
    AND (
         (d.outreach_stage            IS NOT NULL AND d.outreach_stage            IS DISTINCT FROM b.outreach_stage)
      OR (d.outreach_identified_at    IS NOT NULL AND d.outreach_identified_at    IS DISTINCT FROM b.outreach_identified_at)
      OR (d.outreach_contacted_at     IS NOT NULL AND d.outreach_contacted_at     IS DISTINCT FROM b.outreach_contacted_at)
      OR (d.outreach_followed_up_at   IS NOT NULL AND d.outreach_followed_up_at   IS DISTINCT FROM b.outreach_followed_up_at)
      OR (d.outreach_in_discussion_at IS NOT NULL AND d.outreach_in_discussion_at IS DISTINCT FROM b.outreach_in_discussion_at)
      OR (d.outreach_invoice_paid_at  IS NOT NULL AND d.outreach_invoice_paid_at  IS DISTINCT FROM b.outreach_invoice_paid_at)
      OR (d.renewal_stage             IS NOT NULL AND d.renewal_stage             IS DISTINCT FROM b.renewal_stage)
      OR (d.renewal_not_started_at    IS NOT NULL AND d.renewal_not_started_at    IS DISTINCT FROM b.renewal_not_started_at)
      OR (d.renewal_contacted_at      IS NOT NULL AND d.renewal_contacted_at      IS DISTINCT FROM b.renewal_contacted_at)
      OR (d.renewal_in_discussion_at  IS NOT NULL AND d.renewal_in_discussion_at  IS DISTINCT FROM b.renewal_in_discussion_at)
    );
$$;

COMMENT ON FUNCTION public.apply_derived_stages(uuid[]) IS
  'Writes derive_business_stages() output to the given businesses. Skips rows where nothing differs, so it is idempotent.';

GRANT EXECUTE ON FUNCTION public.apply_derived_stages(uuid[]) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.correspondence_refresh_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  affected uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    affected := ARRAY[NEW.business_id] || coalesce(NEW.linked_business_ids, '{}'::uuid[]);
  ELSE
    affected := ARRAY[NEW.business_id, OLD.business_id]
                || coalesce(NEW.linked_business_ids, '{}'::uuid[])
                || coalesce(OLD.linked_business_ids, '{}'::uuid[]);
  END IF;

  -- Deduplicate and drop NULLs before doing any work.
  SELECT array_agg(DISTINCT x) INTO affected
  FROM unnest(affected) AS x
  WHERE x IS NOT NULL;

  IF affected IS NOT NULL THEN
    PERFORM apply_derived_stages(affected);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.correspondence_refresh_stages() IS
  'AFTER trigger on correspondence: recomputes kanban stages for every business the row touches.';

DROP TRIGGER IF EXISTS correspondence_refresh_stages_trigger ON correspondence;

CREATE TRIGGER correspondence_refresh_stages_trigger
AFTER INSERT OR UPDATE OF direction, entry_date, business_id, linked_business_ids, type
ON correspondence
FOR EACH ROW
EXECUTE FUNCTION correspondence_refresh_stages();

-- Deleting an entry can also change a stage (e.g. removing the only inbound
-- reply). Handled separately because a DELETE trigger has no NEW row.
CREATE OR REPLACE FUNCTION public.correspondence_refresh_stages_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  affected uuid[];
BEGIN
  SELECT array_agg(DISTINCT x) INTO affected
  FROM unnest(ARRAY[OLD.business_id] || coalesce(OLD.linked_business_ids, '{}'::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF affected IS NOT NULL THEN
    PERFORM apply_derived_stages(affected);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS correspondence_refresh_stages_delete_trigger ON correspondence;

CREATE TRIGGER correspondence_refresh_stages_delete_trigger
AFTER DELETE ON correspondence
FOR EACH ROW
EXECUTE FUNCTION correspondence_refresh_stages_on_delete();
