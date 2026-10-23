-- Rollback 20261024_001_stage11b: puts the contract trigger, the lead mirror and merge_businesses back
-- as they were on live (23 Oct 2026). Run the data scripts' undos first (5 moves the oe_* tables back,
-- which merge_businesses then needs again).
-- Kept, because they are additive and dropping them needs the dependent views dropped too:
-- businesses.website and the last columns of v_businesses and v_club_card_members (unread once the app
-- code is rolled back).

CREATE OR REPLACE FUNCTION "public"."sync_business_flags_from_contracts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_id uuid; has_club_card boolean; has_advertiser boolean; in_force boolean; cur record; has_cur boolean;
BEGIN
  target_id := COALESCE(NEW.business_id, OLD.business_id);
  SELECT
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current AND membership_type = 'club_card'),
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current AND membership_type = 'advertiser'),
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current
                                     AND coalesce(contract_end, current_date) >= current_date)
  INTO has_club_card, has_advertiser, in_force;

  SELECT contract_start, contract_end, contract_amount, contract_currency, deal_terms, membership_type
  INTO cur FROM contracts
  WHERE business_id = target_id AND is_current
  ORDER BY contract_start DESC NULLS LAST LIMIT 1;
  has_cur := FOUND;

  UPDATE businesses b
  SET
    is_club_card  = has_club_card,
    is_advertiser = has_advertiser,
    membership_type = CASE
      WHEN in_force AND (b.membership_type IS NULL OR b.membership_type LIKE 'former_%')
        THEN coalesce(cur.membership_type, b.membership_type)
      WHEN b.membership_type IS NULL AND has_club_card  THEN 'club_card'
      WHEN b.membership_type IS NULL AND has_advertiser THEN 'advertiser'
      ELSE b.membership_type END,
    contract_start    = CASE WHEN has_cur THEN cur.contract_start    ELSE b.contract_start END,
    contract_end      = CASE WHEN has_cur THEN cur.contract_end      ELSE b.contract_end END,
    contract_amount   = CASE WHEN has_cur THEN cur.contract_amount   ELSE b.contract_amount END,
    contract_currency = CASE WHEN has_cur THEN cur.contract_currency ELSE b.contract_currency END,
    deal_terms        = CASE WHEN has_cur THEN coalesce(cur.deal_terms, b.deal_terms) ELSE b.deal_terms END
  WHERE b.id = target_id;
  -- Stage 11a: status and last in touch come from v_businesses
  PERFORM public.refresh_business_truth(target_id);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION "public"."business_stage_mirrors_lead"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.outreach_stage IS NOT DISTINCT FROM OLD.outreach_stage THEN RETURN NULL; END IF;

  IF NEW.outreach_stage IN ('contacted', 'followed_up', 'in_discussion') THEN
    UPDATE prospect_leads l
    SET status = 'contacted'
    WHERE l.matched_business_id = NEW.id AND l.status IN ('new', 'reviewing', 'outreach_planned');
  ELSIF NEW.outreach_stage IS NULL AND (NEW.is_club_card OR NEW.is_advertiser) THEN
    UPDATE prospect_leads l
    SET status = 'converted'
    WHERE l.matched_business_id = NEW.id AND l.status <> 'converted';
  END IF;

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "public"."merge_businesses"("p_src" "uuid", "p_dst" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  s businesses%ROWTYPE;
  d businesses%ROWTYPE;
  r text;
  backed jsonb := '{}'::jsonb;
  moved jsonb := '{}'::jsonb;
  t text; w text; n integer;
  dst_has_primary boolean;
BEGIN
  IF p_src IS NULL OR p_dst IS NULL OR p_src = p_dst THEN
    RAISE EXCEPTION 'Pick two different businesses';
  END IF;
  PERFORM cc_assert_business_access(ARRAY[p_src, p_dst]);

  SELECT * INTO s FROM businesses WHERE id = p_src FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business to move not found'; END IF;
  SELECT * INTO d FROM businesses WHERE id = p_dst FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target business not found'; END IF;
  IF s.organization_id IS DISTINCT FROM d.organization_id THEN
    RAISE EXCEPTION 'The two businesses belong to different organisations';
  END IF;
  IF s.merged_into IS NOT NULL THEN
    RAISE EXCEPTION '% has already been merged', s.name;
  END IF;
  IF d.merged_into IS NOT NULL OR d.status = 'Not a business' THEN
    RAISE EXCEPTION '% is not a live business; pick another target', d.name;
  END IF;

  r := 'merge ' || p_src || ' into ' || p_dst || ' at ' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US');

  -- Contacts at src, and the contact each one joins at dst (if any)
  DROP TABLE IF EXISTS _cmap;
  CREATE TEMP TABLE _cmap ON COMMIT DROP AS
  SELECT c.id AS src_contact,
         (SELECT o.id FROM contacts o
          WHERE o.business_id = p_dst
            AND (EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(o.emails, '[]')) a,
                                       jsonb_array_elements_text(coalesce(c.emails, '[]')) b
                         WHERE lower(trim(a)) = lower(trim(b)))
                 OR (NOT coalesce(o.name_is_placeholder, false) AND NOT coalesce(c.name_is_placeholder, false)
                     AND lower(trim(o.name)) = lower(trim(c.name))))
          ORDER BY o.is_active DESC, o.created_at LIMIT 1) AS join_to
  FROM contacts c WHERE c.business_id = p_src;

  -- 1. Backup. Every row any step below changes or removes.
  FOR t, w IN VALUES
    ('businesses',          'x.id IN ($1, $2) OR x.merged_into = $1'),
    ('contacts',            'x.business_id = $1 OR x.id IN (SELECT join_to FROM _cmap) OR (x.business_id = $2 AND x.is_primary)'),
    ('correspondence',      'x.business_id = $1 OR x.linked_business_ids @> ARRAY[$1]
                             OR x.contact_id IN (SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL)
                             OR x.cc_contact_ids && ARRAY(SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL)
                             OR x.bcc_contact_ids && ARRAY(SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL)'),
    ('tasks',               'x.business_id = $1'),
    ('domain_mappings',     'x.business_id = $1'),
    ('contracts',           'x.business_id = $1'),
    ('business_files',      'x.business_id = $1'),
    ('business_articles',   'x.business_id = $1'),
    ('care_exclusions',     'x.business_id = $1'),
    ('conversation_threads','x.business_id = $1'),
    ('draft_requests',      'x.business_id = $1'),
    ('duplicate_dismissals','x.business_id = $1'),
    ('insight_cache',       'x.business_id = $1'),
    ('insight_history',     'x.business_id = $1'),
    ('one_off_sales',       'x.business_id = $1'),
    ('qbo_links',           'x.business_id = $1'),
    ('routine_drafts',      'x.business_id = $1'),
    ('mail_scan',           'x.business_id = $1'),
    ('mail_backfill_stage', 'x.business_id = $1'),
    ('task_evidence',       'x.business_id = $1'),
    ('task_term_aliases',   'x.business_id = $1'),
    ('prospect_leads',      'x.matched_business_id = $1'),
    ('resources',           'x.linked_business_id = $1'),
    ('oe_business_links',   'x.cc_business_id = $1'),
    ('oe_pending_matches',  'x.cc_business_id = $1')
  LOOP
    n := cc_backup_rows(r, t, w, p_src, p_dst);
    IF n > 0 THEN backed := backed || jsonb_build_object(t, n); END IF;
  END LOOP;

  -- 2. Contacts. A match gives the dst contact its addresses, phones and role.
  UPDATE contacts o
  SET emails = coalesce(o.emails, '[]'::jsonb) || coalesce((SELECT jsonb_agg(DISTINCT e) FROM (
                 SELECT jsonb_array_elements_text(coalesce(c.emails, '[]')) e FROM contacts c
                 WHERE c.id IN (SELECT src_contact FROM _cmap WHERE join_to = o.id)) a
               WHERE lower(trim(e)) NOT IN (SELECT lower(trim(x)) FROM jsonb_array_elements_text(coalesce(o.emails, '[]')) x)), '[]'::jsonb),
      phones = coalesce(o.phones, '[]'::jsonb) || coalesce((SELECT jsonb_agg(DISTINCT p) FROM (
                 SELECT jsonb_array_elements(coalesce(c.phones, '[]')) p FROM contacts c
                 WHERE c.id IN (SELECT src_contact FROM _cmap WHERE join_to = o.id)) a
               WHERE NOT coalesce(o.phones, '[]'::jsonb) @> jsonb_build_array(p)), '[]'::jsonb),
      role = coalesce(nullif(o.role, ''), (SELECT c.role FROM contacts c
                 WHERE c.id IN (SELECT src_contact FROM _cmap WHERE join_to = o.id) AND nullif(c.role, '') IS NOT NULL LIMIT 1)),
      is_active = o.is_active OR EXISTS (SELECT 1 FROM contacts c
                 WHERE c.id IN (SELECT src_contact FROM _cmap WHERE join_to = o.id) AND c.is_active)
  WHERE o.id IN (SELECT join_to FROM _cmap WHERE join_to IS NOT NULL);

  UPDATE correspondence c SET contact_id = m.join_to
  FROM _cmap m WHERE m.join_to IS NOT NULL AND c.contact_id = m.src_contact;

  UPDATE correspondence c
  SET cc_contact_ids  = ARRAY(SELECT DISTINCT coalesce(m.join_to, x) FROM unnest(c.cc_contact_ids) x LEFT JOIN _cmap m ON m.src_contact = x),
      bcc_contact_ids = ARRAY(SELECT DISTINCT coalesce(m.join_to, x) FROM unnest(c.bcc_contact_ids) x LEFT JOIN _cmap m ON m.src_contact = x)
  WHERE c.cc_contact_ids && ARRAY(SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL)
     OR c.bcc_contact_ids && ARRAY(SELECT src_contact FROM _cmap WHERE join_to IS NOT NULL);

  UPDATE contacts c
  SET is_active = false, is_primary = false,
      notes = concat_ws(E'\n', nullif(c.notes, ''),
              'Joined to the matching contact at ' || d.name || ' on ' || to_char(now(), 'DD/MM/YYYY') || '.')
  FROM _cmap m WHERE m.join_to IS NOT NULL AND c.id = m.src_contact;

  dst_has_primary := EXISTS (SELECT 1 FROM contacts WHERE business_id = p_dst AND is_primary);
  UPDATE contacts c SET business_id = p_dst, is_primary = c.is_primary AND NOT dst_has_primary
  FROM _cmap m WHERE m.join_to IS NULL AND c.id = m.src_contact;
  GET DIAGNOSTICS n = ROW_COUNT;
  moved := moved || jsonb_build_object('contacts_moved', n,
             'contacts_joined', (SELECT count(*) FROM _cmap WHERE join_to IS NOT NULL));

  -- 3. Correspondence and its cross-links
  UPDATE correspondence SET business_id = p_dst WHERE business_id = p_src;
  GET DIAGNOSTICS n = ROW_COUNT;
  moved := moved || jsonb_build_object('correspondence', n);

  UPDATE correspondence c
  SET linked_business_ids = ARRAY(
        SELECT DISTINCT y FROM (SELECT CASE WHEN x = p_src THEN p_dst ELSE x END y FROM unnest(c.linked_business_ids) x) z
        WHERE y <> c.business_id)
  WHERE c.linked_business_ids @> ARRAY[p_src];

  -- 4. Tables with no unique key on the business: everything moves
  FOR t, w IN VALUES
    ('domain_mappings', 'business_id'), ('contracts', 'business_id'), ('business_files', 'business_id'),
    ('conversation_threads', 'business_id'), ('draft_requests', 'business_id'),
    ('duplicate_dismissals', 'business_id'), ('insight_history', 'business_id'),
    ('one_off_sales', 'business_id'), ('routine_drafts', 'business_id'), ('mail_scan', 'business_id'),
    ('mail_backfill_stage', 'business_id'), ('task_evidence', 'business_id'),
    ('prospect_leads', 'matched_business_id'), ('resources', 'linked_business_id'),
    ('oe_pending_matches', 'cc_business_id')
  LOOP
    EXECUTE format('UPDATE public.%I SET %I = $2 WHERE %I = $1', t, w, w) USING p_src, p_dst;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN moved := moved || jsonb_build_object(t, n); END IF;
  END LOOP;

  -- 5. Tables with a unique key: move what doesn't clash; clashes are already at dst
  UPDATE tasks x SET business_id = p_dst
  WHERE x.business_id = p_src
    AND (x.source IN ('manual', 'signal') OR NOT EXISTS (
         SELECT 1 FROM tasks y WHERE y.business_id = p_dst AND y.organization_id = x.organization_id
           AND y.source = x.source AND y.due_date = x.due_date));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN moved := moved || jsonb_build_object('tasks', n); END IF;

  UPDATE business_articles x SET business_id = p_dst WHERE x.business_id = p_src
    AND NOT EXISTS (SELECT 1 FROM business_articles y WHERE y.business_id = p_dst AND y.url = x.url);
  DELETE FROM business_articles WHERE business_id = p_src;

  UPDATE care_exclusions x SET business_id = p_dst WHERE x.business_id = p_src
    AND NOT EXISTS (SELECT 1 FROM care_exclusions y WHERE y.business_id = p_dst AND y.kind = x.kind);
  DELETE FROM care_exclusions WHERE business_id = p_src;

  UPDATE qbo_links x SET business_id = p_dst WHERE x.business_id = p_src
    AND NOT EXISTS (SELECT 1 FROM qbo_links y WHERE y.business_id = p_dst AND y.qbo_customer_id = x.qbo_customer_id);
  DELETE FROM qbo_links WHERE business_id = p_src;

  UPDATE task_term_aliases x SET business_id = p_dst WHERE x.business_id = p_src
    AND NOT EXISTS (SELECT 1 FROM task_term_aliases y WHERE y.business_id = p_dst AND y.alias = x.alias);
  DELETE FROM task_term_aliases WHERE business_id = p_src;

  UPDATE oe_business_links SET cc_business_id = p_dst WHERE cc_business_id = p_src
    AND NOT EXISTS (SELECT 1 FROM oe_business_links WHERE cc_business_id = p_dst);

  -- cached insights describe one record's history; they regenerate
  DELETE FROM insight_cache WHERE business_id = p_src;

  -- 6. The business rows. dst keeps its own values and gains any src has that it lacks.
  UPDATE businesses x
  SET category           = coalesce(nullif(x.category, ''), s.category),
      address            = coalesce(nullif(x.address, ''), s.address),
      email              = coalesce(nullif(x.email, ''), s.email),
      phone              = coalesce(nullif(x.phone, ''), s.phone),
      business_type      = coalesce(x.business_type, s.business_type),
      membership_type    = coalesce(x.membership_type, s.membership_type),
      disposition        = coalesce(x.disposition, s.disposition),
      follow_up_after    = coalesce(x.follow_up_after, s.follow_up_after),
      last_contacted_at  = greatest(x.last_contacted_at, s.last_contacted_at),
      mastersheet_source_ids = CASE
        WHEN jsonb_typeof(x.mastersheet_source_ids) = 'array' AND jsonb_typeof(s.mastersheet_source_ids) = 'array'
          THEN (SELECT coalesce(jsonb_agg(DISTINCT v), '[]'::jsonb) FROM (
                  SELECT jsonb_array_elements(x.mastersheet_source_ids) v
                  UNION SELECT jsonb_array_elements(s.mastersheet_source_ids)) z)
        ELSE coalesce(x.mastersheet_source_ids, s.mastersheet_source_ids) END,
      -- a record with no status (colleagues, councils, contributors) keeps none
      status = CASE
        WHEN x.status IN ('Unreviewed', 'Prospect') AND s.status IN ('Active', 'Former') THEN s.status
        WHEN x.status = 'Unreviewed' THEN 'Prospect'
        ELSE x.status END,
      notes = concat_ws(E'\n', nullif(x.notes, ''),
              'Merged in ' || s.name || ' on ' || to_char(now(), 'DD/MM/YYYY') || '.'
              || CASE WHEN nullif(s.notes, '') IS NOT NULL THEN ' Its notes: ' || s.notes ELSE '' END)
  WHERE x.id = p_dst;

  -- earlier merges into src now point at dst
  UPDATE businesses SET merged_into = p_dst WHERE merged_into = p_src;

  UPDATE businesses x
  SET status = 'Not a business', merged_into = p_dst,
      is_club_card = false, is_advertiser = false,
      notes = concat_ws(E'\n', nullif(x.notes, ''),
              'Merged into ' || d.name || ' on ' || to_char(now(), 'DD/MM/YYYY') || '.')
  WHERE x.id = p_src;

  -- 7. Checks: nothing live is left on src
  SELECT count(*) INTO n FROM correspondence WHERE business_id = p_src;
  IF n > 0 THEN RAISE EXCEPTION '% emails still on the merged business', n; END IF;
  SELECT count(*) INTO n FROM contacts WHERE business_id = p_src AND is_active;
  IF n > 0 THEN RAISE EXCEPTION '% active contacts still on the merged business', n; END IF;
  SELECT count(*) INTO n FROM contracts WHERE business_id = p_src;
  IF n > 0 THEN RAISE EXCEPTION '% contracts still on the merged business', n; END IF;
  SELECT count(*) INTO n FROM tasks WHERE business_id = p_src AND status <> 'done';
  IF n > 0 THEN RAISE EXCEPTION '% open tasks still on the merged business', n; END IF;
  SELECT count(*) INTO n FROM domain_mappings WHERE business_id = p_src;
  IF n > 0 THEN RAISE EXCEPTION '% domain links still on the merged business', n; END IF;

  DROP TABLE _cmap;
  RETURN jsonb_build_object('reason', r, 'src', p_src, 'dst', p_dst,
                            'src_name', s.name, 'dst_name', d.name,
                            'backed_up', backed, 'moved', moved);
END $_$;
