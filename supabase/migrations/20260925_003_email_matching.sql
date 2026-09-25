-- 20260925_003_email_matching.sql
--
-- Emails that went to the wrong business, or nowhere.
--
-- Found on 25 Sep 2026:
--   * Tom's reply to admin@oddonos.com (1 Sep, BCC'd) was dropped. Only
--     manager.chiswick@oddonos.com was on file and oddonos.com had no domain
--     mapping, so the webhook knew nobody. Since 21 Sep the same email would
--     have created a second, duplicate "Oddonos" business instead.
--   * Tim Slater (tim@thehogarth.co.uk) is a contact at two businesses, and the
--     webhook took whichever the database returned first: Tom's Hogarth Club
--     reply of 28 Aug was filed under Agnes Dos Santos Lash Experts.
--
-- Two helpers for the webhook:
--   business_for_domain: the business for an email domain. The learned domain
--     mapping first; otherwise, when every contact (or business address) on
--     that domain belongs to one business, that business, and the mapping is
--     learned. Never guesses between two businesses.
--   pick_business: when one address belongs to contacts at several businesses,
--     prefer the one named in the subject, then the one most recently in
--     correspondence, then one with a current contract.
-- Callers pass only company domains (gmail and the like are filtered first).

CREATE OR REPLACE FUNCTION public.business_for_domain(p_org uuid, p_domain text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  d text := lower(trim(p_domain));
  found uuid;
  n int;
BEGIN
  IF d IS NULL OR d = '' THEN RETURN NULL; END IF;

  SELECT business_id INTO found FROM domain_mappings WHERE org_id = p_org AND domain = d;
  IF found IS NOT NULL THEN RETURN found; END IF;

  WITH owners AS (
    SELECT c.business_id
    FROM contacts c
    JOIN businesses b ON b.id = c.business_id AND b.organization_id = p_org
    WHERE c.is_active
      AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.emails) e WHERE lower(split_part(e, '@', 2)) = d)
    UNION
    SELECT b.id FROM businesses b
    WHERE b.organization_id = p_org AND lower(split_part(coalesce(b.email, ''), '@', 2)) = d
  )
  SELECT count(DISTINCT business_id), min(business_id::text)::uuid INTO n, found FROM owners;

  IF n = 1 THEN
    INSERT INTO domain_mappings (org_id, domain, business_id)
    VALUES (p_org, d, found)
    ON CONFLICT DO NOTHING;
    RETURN found;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.pick_business(p_ids uuid[], p_subject text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT b.id
  FROM businesses b
  WHERE b.id = ANY (p_ids)
  ORDER BY
    -- the subject names the business ("Hogarth Club, renewing the partnership")
    (coalesce(p_subject, '') ILIKE '%' || split_part(regexp_replace(b.name, '[^A-Za-z0-9 &'']', ' ', 'g'), ' ', 1) || '%'
      AND length(split_part(b.name, ' ', 1)) >= 4) DESC,
    (SELECT max(entry_date) FROM correspondence x WHERE x.business_id = b.id) DESC NULLS LAST,
    EXISTS (SELECT 1 FROM contracts c WHERE c.business_id = b.id AND c.is_current) DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.business_for_domain(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.pick_business(uuid[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_for_domain(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pick_business(uuid[], text) TO service_role;
