-- Stage 3 of the UI overhaul: one canonical record per business.
--
--   businesses.merged_into   the business a merged record was folded into
--   contacts.is_primary      at most one per business, shown first
--   org_business_types.is_commercial
--                            false for Internal, Community, Council / Public
--                            sector, Contributor and Media / PR: businesses of
--                            those types stay out of commercial views (the
--                            attention view and table home in Stages 4 and 5)
--
--   merge_businesses(src, dst)
--     Folds src into dst, generalising the tested Stage 2 cleanup
--     (supabase/data-fixes/20261021_stage2_review_cleanup.sql) to every table
--     that points at a business. A contact at src that matches one at dst (same
--     email, or the same real name) gives it its addresses and phones and is
--     switched off; the rest move as they are. Rows that would break a unique
--     key at dst (same article URL, care exclusion kind, QuickBooks link, alias,
--     cached insight) stay behind or are removed, and are backed up either way.
--     src is left as a 'Not a business' record with merged_into = dst.
--   undo_business_merge(reason)
--     Puts every backed-up row back exactly as it was.
--   undo_last_business_change(id)
--     The app's Undo: undoes the latest merge or hide of that business.
--   mark_not_a_business(id)
--     Hides a business: status 'Not a business', domain links removed, open
--     tasks closed. Its correspondence and contacts stay. Undo with
--     undo_business_merge(reason) too.
--
-- Every row a function changes or removes is copied to cc_phase0_backup first,
-- under the reason the function returns. The functions run as their owner so
-- they can write the backup (which has RLS and no policies); each checks the
-- caller belongs to the business's organisation. Not callable without signing in.
--
-- Rollback: supabase/migrations/rollback/20261021_003_merge_businesses_rollback.sql

BEGIN;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS merged_into uuid
  REFERENCES businesses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS businesses_merged_into_idx ON businesses (merged_into) WHERE merged_into IS NOT NULL;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_one_primary_per_business ON contacts (business_id) WHERE is_primary;

ALTER TABLE org_business_types ADD COLUMN IF NOT EXISTS is_commercial boolean NOT NULL DEFAULT true;
UPDATE org_business_types SET is_commercial = false
WHERE value IN ('internal', 'community', 'council', 'contributor', 'media_pr');

-- Copies rows of one table to cc_phase0_backup. p_where may use $1 (src) and $2 (dst).
-- Tables whose key isn't a uuid get a stable uuid made from the key, as in Stage 2.
CREATE OR REPLACE FUNCTION public.cc_backup_rows(p_reason text, p_table text, p_where text, p_src uuid, p_dst uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  pk text; pk_type text; n integer;
BEGIN
  SELECT a.attname, format_type(a.atttypid, a.atttypmod) INTO pk, pk_type
  FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
  WHERE i.indrelid = ('public.' || quote_ident(p_table))::regclass AND i.indisprimary;

  EXECUTE format(
    'INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
     SELECT %1$L, %2$s, to_jsonb(x), %3$L FROM public.%1$I x WHERE %4$s',
    p_table,
    CASE WHEN pk_type = 'uuid' THEN 'x.' || quote_ident(pk)
         ELSE format('md5(%L || x.%I)::uuid', p_table || ':', pk) END,
    p_reason, p_where)
  USING p_src, p_dst;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Refuses a signed-in caller from another organisation. Service role and psql
-- (no auth.uid()) pass; anon can't reach the callers at all (grants below).
CREATE OR REPLACE FUNCTION public.cc_assert_business_access(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_ids) u(bid)
    LEFT JOIN businesses b ON b.id = u.bid
    WHERE b.organization_id IS DISTINCT FROM (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not allowed: business not in your organisation';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.merge_businesses(p_src uuid, p_dst uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      status = CASE
        WHEN coalesce(x.status, '') IN ('', 'Unreviewed', 'Prospect') AND s.status IN ('Active', 'Former') THEN s.status
        WHEN coalesce(x.status, '') IN ('', 'Unreviewed') THEN 'Prospect'
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
END $$;

CREATE OR REPLACE FUNCTION public.mark_not_a_business(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b businesses%ROWTYPE; r text; backed jsonb := '{}'::jsonb; t text; w text; n integer; closed integer; unlinked integer;
BEGIN
  PERFORM cc_assert_business_access(ARRAY[p_id]);
  SELECT * INTO b FROM businesses WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found'; END IF;
  IF b.status = 'Not a business' THEN RAISE EXCEPTION '% is already marked Not a business', b.name; END IF;
  IF EXISTS (SELECT 1 FROM contracts WHERE business_id = p_id AND is_current) THEN
    RAISE EXCEPTION '% has a current contract; it can''t be hidden', b.name;
  END IF;

  r := 'not a business ' || p_id || ' at ' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US');

  -- closing a task writes the tick back to its email (Stage 1), so the emails are backed up too
  FOR t, w IN VALUES
    ('businesses',      'x.id = $1'),
    ('tasks',           'x.business_id = $1 AND x.status <> ''done'''),
    ('correspondence',  'x.business_id = $1'),
    ('domain_mappings', 'x.business_id = $1')
  LOOP
    n := cc_backup_rows(r, t, w, p_id, NULL);
    IF n > 0 THEN backed := backed || jsonb_build_object(t, n); END IF;
  END LOOP;

  UPDATE tasks SET status = 'done', completed_at = now(),
         signal_meta = coalesce(signal_meta, '{}'::jsonb) || jsonb_build_object('closed_by', 'mark_not_a_business')
  WHERE business_id = p_id AND status <> 'done';
  GET DIAGNOSTICS closed = ROW_COUNT;

  DELETE FROM domain_mappings WHERE business_id = p_id;
  GET DIAGNOSTICS unlinked = ROW_COUNT;

  UPDATE businesses SET status = 'Not a business',
         notes = concat_ws(E'\n', nullif(notes, ''), 'Marked Not a business on ' || to_char(now(), 'DD/MM/YYYY') || '.')
  WHERE id = p_id;

  RETURN jsonb_build_object('reason', r, 'id', p_id, 'name', b.name, 'previous_status', b.status,
                            'tasks_closed', closed, 'domain_links_removed', unlinked, 'backed_up', backed);
END $$;

-- Puts back every row backed up under one reason: rows still there are updated
-- to their old values, removed rows are re-inserted. Relabels the backup
-- '<reason> (undone)' so it can't be applied twice.
CREATE OR REPLACE FUNCTION public.undo_business_merge(p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t text; pk text; cols text; n integer; restored jsonb := '{}'::jsonb;
BEGIN
  IF p_reason IS NULL OR (p_reason NOT LIKE 'merge %' AND p_reason NOT LIKE 'not a business %') THEN
    RAISE EXCEPTION 'Only merges and Not a business changes can be undone here';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cc_phase0_backup WHERE reason = p_reason) THEN
    RAISE EXCEPTION 'Nothing backed up under %', p_reason;
  END IF;
  PERFORM cc_assert_business_access(ARRAY(
    SELECT (before_row->>'id')::uuid FROM cc_phase0_backup WHERE reason = p_reason AND table_name = 'businesses'));

  -- contacts first so emails can point at them again; businesses last, because
  -- moving emails back makes a trigger re-derive the businesses' stages
  FOR t IN
    SELECT table_name FROM cc_phase0_backup WHERE reason = p_reason GROUP BY table_name
    ORDER BY CASE table_name WHEN 'contacts' THEN 0 WHEN 'businesses' THEN 2 ELSE 1 END, table_name
  LOOP
    SELECT a.attname INTO pk
    FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = ('public.' || quote_ident(t))::regclass AND i.indisprimary;

    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t AND column_name <> pk AND is_generated = 'NEVER';

    EXECUTE format(
      'UPDATE public.%1$I x SET (%2$s) = (SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, b.before_row))
       FROM cc_phase0_backup b
       WHERE b.reason = %3$L AND b.table_name = %1$L
         AND x.%4$I = (jsonb_populate_record(NULL::public.%1$I, b.before_row)).%4$I', t, cols, p_reason, pk);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN restored := restored || jsonb_build_object(t, n); END IF;

    EXECUTE format(
      'INSERT INTO public.%1$I (%4$I, %5$s) SELECT r.%4$I, %6$s
       FROM cc_phase0_backup b, jsonb_populate_record(NULL::public.%1$I, b.before_row) r
       WHERE b.reason = %2$L AND b.table_name = %1$L
         AND NOT EXISTS (SELECT 1 FROM public.%1$I x WHERE x.%4$I = r.%4$I)',
      t, p_reason, NULL, pk, cols,
      (SELECT string_agg('r.' || c, ', ') FROM unnest(string_to_array(cols, ', ')) c));
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN restored := restored || jsonb_build_object(t || '_reinserted', n); END IF;
  END LOOP;

  UPDATE cc_phase0_backup SET reason = p_reason || ' (undone)' WHERE reason = p_reason;
  RETURN jsonb_build_object('reason', p_reason, 'restored', restored);
END $$;

-- The app's Undo button on a merged or hidden record: undoes the latest change
-- made to that business by merge_businesses or mark_not_a_business.
CREATE OR REPLACE FUNCTION public.undo_last_business_change(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r text;
BEGIN
  PERFORM cc_assert_business_access(ARRAY[p_id]);
  SELECT reason INTO r FROM cc_phase0_backup
  WHERE (reason LIKE 'merge ' || p_id || ' into % at %' OR reason LIKE 'not a business ' || p_id || ' at %')
    AND reason NOT LIKE '% (undone)'
  ORDER BY taken_at DESC, id DESC LIMIT 1;
  IF r IS NULL THEN RAISE EXCEPTION 'No merge or hide of this business to undo'; END IF;
  RETURN undo_business_merge(r);
END $$;

REVOKE ALL ON FUNCTION public.cc_backup_rows(text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cc_assert_business_access(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_businesses(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_not_a_business(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_business_merge(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_last_business_change(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_last_business_change(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_businesses(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_not_a_business(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_business_merge(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_backup_rows(text, text, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cc_assert_business_access(uuid[]) TO service_role;

COMMIT;
