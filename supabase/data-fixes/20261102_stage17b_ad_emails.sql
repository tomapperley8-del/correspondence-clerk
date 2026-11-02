-- Stage 17b (5): link Dawn's and James's ad emails to the advertiser, and seed ad_placements / ad_reports from what the
-- emails say. Run after migration 20261102_006_ad_emails. Undo: 20261102_stage17b_ad_emails_undo.sql.
-- Sure matches (every word of the business name is in the subject, exactly one business) are linked now: the email stays
-- on Dawn's/James's record and also shows on the advertiser (correspondence.linked_business_ids). Short-name matches and
-- ones read from the email body go to ad_email_links as 'pending' for Tom on Data health. Before-images of every changed
-- entry: cc_phase0_backup, reason 'stage17b ad emails 2026-11-02' (table_name 'correspondence', before_row {linked_business_ids}).
BEGIN;

CREATE TEMP TABLE _ad AS
WITH team AS (
  SELECT c.id FROM contacts c JOIN businesses b ON b.id = c.business_id
   WHERE b.business_type = 'internal' AND (c.emails::text ILIKE '%dawn@dwmultimedia.co.uk%' OR c.emails::text ILIKE '%james@willcocks.uk%')
), stop AS (
  SELECT unnest(string_to_array('the chiswick calendar london ad ads advert adverts advertising advertisement stats sidebar leaderboard banner ltd limited and x fw fwd re with club card updated new small bits refresh tile co of for to on in a analytics campaign expire artwork', ' ')) w
), e AS (
  SELECT x.id, x.business_id AS home_id,
         ARRAY(SELECT DISTINCT t FROM unnest(string_to_array(regexp_replace(lower(regexp_replace(coalesce(x.subject,''), '^((fw|fwd|re):\s*)+', '', 'i')), '[^a-z0-9 ]', '', 'g'), ' ')) t
                WHERE t <> '' AND t NOT IN (SELECT w FROM stop)) AS st
    FROM correspondence x
   WHERE x.contact_id IN (SELECT id FROM team)
     AND x.subject ~* '\m(ads?|stats|sidebar|leaderboard|banner|artwork|advert\w*|campaign|expire|tile|analytics)\M'
     AND x.subject !~* 'Google Ad Manager'
), bz AS (
  SELECT b.id, b.name,
         ARRAY(SELECT DISTINCT t FROM unnest(string_to_array(regexp_replace(regexp_replace(lower(b.name), '^the ', ''), '[^a-z0-9 ]', '', 'g'), ' ')) t
                WHERE t <> '' AND t NOT IN (SELECT w FROM stop)) AS bt
    FROM businesses b
   WHERE coalesce(b.business_type, '') <> 'internal' AND b.status <> 'Not a business' AND b.merged_into IS NULL
), m AS (
  SELECT e.id AS entry_id, e.home_id, bz.id AS biz_id, bz.name,
         (bz.bt <@ e.st) AS full_name, (e.st <@ bz.bt) AS short_name,
         count(*) FILTER (WHERE bz.bt <@ e.st) OVER (PARTITION BY e.id) AS n_full
    FROM e JOIN bz ON cardinality(bz.bt) > 0 AND cardinality(e.st) > 0 AND (bz.bt <@ e.st OR (e.st <@ bz.bt AND length(array_to_string(e.st, '')) >= 4))
)
SELECT entry_id, home_id, biz_id, name, kind, why FROM (
  SELECT entry_id, home_id, biz_id, name,
         CASE WHEN full_name AND n_full = 1 THEN 'sure' ELSE 'pending' END AS kind,
         CASE WHEN full_name AND n_full = 1 THEN 'name in the subject'
              WHEN full_name THEN 'name in the subject, but more than one business fits'
              ELSE 'short name in the subject' END AS why,
         count(*) FILTER (WHERE full_name AND n_full = 1) OVER (PARTITION BY entry_id) AS n_sure,
         count(*) OVER (PARTITION BY entry_id) AS n_all
    FROM m) z
 -- a sure match wins; otherwise suggest only when 3 businesses or fewer fit (a lone word like "House" fits dozens)
 WHERE kind = 'sure' OR (n_sure = 0 AND n_all <= 3);

-- Read from the email bodies by hand (Tom confirms): subject + business name
INSERT INTO _ad
SELECT x.id, x.business_id, b.id, b.name, 'pending', 'named in the email text'
  FROM (VALUES
    ('FW: AWL Ad refresh', 'AUTO WEST LONDON'),
    ('FW: Adverts', 'HOME INSTEAD'),
    ('Chiswick House sidebar ad', 'CHISWICK HOUSE AND SHOP'),
    ('FW: Chiswick House sidebar ad', 'CHISWICK HOUSE AND SHOP'),
    ('Banner Ads', 'THE HOUND'), ('Fw: Banner Ads', 'THE HOUND'),
    ('Chiswick Calendar ads', 'THE HOUND'), ('Fw: Chiswick Calendar ads', 'THE HOUND'),
    ('FW: Chiswick Calendar – Club Card & Advertising', 'CHISWICK PHYSIO')
  ) v(subj, bname)
  JOIN correspondence x ON x.subject = v.subj
  JOIN contacts c ON c.id = x.contact_id AND (c.emails::text ILIKE '%dawn@dwmultimedia.co.uk%' OR c.emails::text ILIKE '%james@willcocks.uk%')
  JOIN businesses b ON b.name = v.bname AND b.merged_into IS NULL
 WHERE NOT EXISTS (SELECT 1 FROM _ad a WHERE a.entry_id = x.id AND a.biz_id = b.id);

-- Sure matches: link (only where not already linked and not the entry's own business)
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'correspondence', x.id, jsonb_build_object('linked_business_ids', to_jsonb(coalesce(x.linked_business_ids, '{}'::uuid[]))), 'stage17b ad emails 2026-11-02'
  FROM correspondence x WHERE x.id IN (SELECT entry_id FROM _ad WHERE kind = 'sure' AND biz_id <> home_id);

UPDATE correspondence x
   SET linked_business_ids = (SELECT array_agg(DISTINCT u) FROM unnest(coalesce(x.linked_business_ids, '{}'::uuid[]) || s.ids) u)
  FROM (SELECT entry_id, array_agg(DISTINCT biz_id) ids FROM _ad WHERE kind = 'sure' AND biz_id <> home_id GROUP BY 1) s
 WHERE x.id = s.entry_id;

INSERT INTO ad_email_links (organization_id, correspondence_id, business_id, why, state)
SELECT '00000000-0000-0000-0000-000000000001', entry_id, biz_id, why, CASE WHEN kind = 'sure' THEN 'confirmed' ELSE 'pending' END
  FROM _ad WHERE biz_id <> home_id
ON CONFLICT (correspondence_id, business_id) DO NOTHING;

-- Placements and reports, as the emails say. e(prefix) = first 8 characters of the source entry id.
CREATE TEMP TABLE _src AS SELECT id, left(id::text, 8) AS p FROM correspondence WHERE left(id::text, 8) IN
 ('578366f6','5120462b','fd31a5c1','477afd42','f580c12c','2e9db74f','15773d43','7057ed17','7a25b058','29012267','edce7687','044d804c');

INSERT INTO ad_placements (organization_id, business_id, placement, live_from, expires, note, source_entry_id, source)
SELECT '00000000-0000-0000-0000-000000000001', b.id, v.placement, v.live_from::date, v.expires::date, v.note, s.id, 'stage17b ad emails 2026-11-02'
  FROM (VALUES
    ('CHISWICK HOUSE AND SHOP', '578366f6', 'sidebar', '2026-10-20', '2026-12-24', 'Dawn: "The ad is now live. I’ve set it to expire the 24th December."'),
    ('AUTO WEST LONDON',        '5120462b', NULL,      NULL,         '2027-07-23', 'Dawn, 22/07/2026: "Expires July 23 2027."'),
    ('ROCKS LANE',              'fd31a5c1', 'sidebar', '2026-05-20', '2026-08-21', 'Dawn: "The Rocks Lane ad is now live for 3 months to 21 August."'),
    ('LIL'' NASHVILLE',         '477afd42', 'leaderboard', NULL,    '2026-07-13', 'Tom, 14/04/2026: "extended their leaderboard ad with us until the 13th of July"'),
    ('KILLIK & CO',             'f580c12c', 'sidebar', NULL,         '2026-08-02', 'Tom, 07/09/2026: "Killik chose not to renew the actual sidebar adverts with us, although they''re still contributing the blogs monthly". Dawn took the ad down again.'),
    ('CHISWICK CHEESE MARKET',  '7057ed17', NULL,      '2026-06-10', NULL,         'Dawn: June ad "now live"'),
    ('CHISWICK CHEESE MARKET',  '15773d43', NULL,      '2026-07-05', NULL,         'Dawn: July ad "scheduled to start 5th July"'),
    ('CHISWICK CHEESE MARKET',  '2e9db74f', NULL,      '2026-11-01', NULL,         'Dawn: November ad "scheduled for November 1st"'),
    ('HOME INSTEAD',            '7a25b058', 'sidebar', NULL,         NULL,         'Two sidebar ads with separate links, wanted pinned together (Dawn''s email 14/09/2026)')
  ) v(bname, p, placement, live_from, expires, note)
  JOIN businesses b ON b.name = v.bname AND b.merged_into IS NULL
  JOIN _src s ON s.p = v.p;

INSERT INTO ad_reports (organization_id, business_id, period_start, period_end, placement, figures, note, source_entry_id, source)
SELECT '00000000-0000-0000-0000-000000000001', b.id, v.ps::date, v.pe::date, v.placement, v.figures::jsonb, v.note, s.id, 'stage17b ad emails 2026-11-02'
  FROM (VALUES
    ('Archie''s London', '29012267', '2026-07-02', '2026-08-03', NULL,
      '{"article_views":140,"article_active_users":113,"average_reading_time":"1minute 24 seconds"}',
      'Dawn: "basic stats for Archies, the ad ran from July 2nd to August 3rd"; figures are for their article. Ad impressions and clicks were in screenshots.'),
    ('M|P Studio', 'edce7687', '2026-09-01', '2026-09-15', NULL, '{"impressions":66478,"clicks":21}', 'Dawn: "stats for September so far: 66,478 impressions and 21 clicks"'),
    ('CHISWICK CINEMA', '044d804c', '2023-10-25', '2023-12-31', 'sidebar', '{"impressions":148558,"monthly_impressions":65540,"clicks":177}', 'Dawn, 09/04/2026: previous campaign'),
    ('CHISWICK CINEMA', '044d804c', '2023-11-03', '2023-12-31', 'leaderboard', '{"impressions":87626,"monthly_impressions":44555,"clicks":42}', 'Dawn, 09/04/2026: previous campaign'),
    ('CHISWICK CINEMA', '044d804c', '2025-05-28', '2026-04-08', 'sidebar', '{"impressions":892469,"monthly_impressions":84997,"clicks":538}', 'Dawn, 09/04/2026: most recent campaign')
  ) v(bname, p, ps, pe, placement, figures, note)
  JOIN businesses b ON b.name = v.bname AND b.merged_into IS NULL
  JOIN _src s ON s.p = v.p;

SELECT (SELECT count(*) FROM ad_email_links WHERE state='confirmed') linked, (SELECT count(*) FROM ad_email_links WHERE state='pending') pending,
       (SELECT count(*) FROM ad_placements) placements, (SELECT count(*) FROM ad_reports) reports;
COMMIT;
