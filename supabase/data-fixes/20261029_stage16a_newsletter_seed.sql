-- Stage 16a, the Newsletter tab: first contributors and deal promises. Run after migration
-- 20261029_002_newsletter_items. Tom edits both lists on the tab afterwards.
--
-- Contributors: the regular writers found across the 120 issues (14 May 2024 to 28 Oct 2026). Band
-- members named in the jazz listings (Russ Varakuta, Jamie Royan, Jeremy Robinson, Dom Durner) are left out.
-- "Every" is how often Tom expects them (blank = no fixed rhythm; the tab still ranks them).
-- Promises: the newsletter space in current deals' terms (contracts.deal_terms):
--   KILLIK & CO      "Six months Money blogs @ £200 per blog"           6 blogs per term
--   CHISWICK CINEMA  "12 months newsletter banners @ £75/mo"            1 banner a month (ticked by hand)
--   HOGARTH CLUB     "Ad in weekly newsletter"                          1 ad a week (ticked by hand)
--   ARTISTS AT HOME  "Which includes 1 editorial"                       1 editorial per term
--   WEST & HUNTER    "Featured article"                                 1 editorial per term
--
-- Refuses to run twice. Undo: 20261029_stage16a_newsletter_seed_undo.sql
DO $$
DECLARE
  org uuid := '00000000-0000-0000-0000-000000000001';
  tag text := 'Stage 16a seed 29 Oct 2026';
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.newsletter_contributors WHERE notes LIKE tag || '%')
     OR EXISTS (SELECT 1 FROM public.newsletter_promises WHERE notes LIKE tag || '%') THEN
    RAISE EXCEPTION 'already run: rows tagged "%" exist', tag;
  END IF;

  FOR r IN SELECT * FROM (VALUES
    ('Andrea Carnevali', 'Film reviews',            NULL::uuid,                                    '{}'::text[],            14,   true),
    ('Larry Pryce',      'Jazz at George IV',       NULL,                                          '{}',                    7,    true),
    ('Sara Ward',        'Living the Good Life',    'e56cd10a-7f9f-4fbd-8c0c-25729f9b9e82'::uuid,  '{Hen Corner}',          30,   true),
    ('Rosie Fyles',      'Gardens',                 NULL,                                          '{}',                    30,   true),
    ('Lucy Cufflin',     'Cheese Market',           '308a995d-3c26-4d5d-b3ad-2a74b094f93b'::uuid,  '{}',                    30,   true),
    ('Andy Slaughter',   'MP''s column',            NULL,                                          '{Andy Slaughter MP}',   NULL, true),
    ('Angsty Aunt',      'Agony aunt column',       NULL,                                          '{}',                    NULL, false),
    ('Dan Coombes',      'Bookshelf',               NULL,                                          '{}',                    NULL, true),
    ('David Smith',      'Three Old Hacks',         NULL,                                          '{}',                    NULL, true),
    ('Tom Apperley',     'Reviews',                 NULL,                                          '{}',                    NULL, true)
  ) AS v(name, column_name, business_id, aliases, every_days, active) LOOP
    INSERT INTO public.newsletter_contributors (organization_id, name, column_name, business_id, aliases, expected_every_days, active, notes)
    VALUES (org, r.name, r.column_name, r.business_id, r.aliases, r.every_days, r.active, tag)
    ON CONFLICT (organization_id, name) DO NOTHING;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('5e7ff34c-c467-4947-b267-81eba447b94c'::uuid, 'blog',      6, 'term',  'Six months Money blogs @ £200 per blog'),
    ('e4da68c2-4864-426d-a7ce-02018e7ca816'::uuid, 'banner',    1, 'month', '12 months newsletter banners @ £75/mo'),
    ('72c0c4e1-b4b6-4839-ae59-60852848f347'::uuid, 'ad',        1, 'week',  'Ad in weekly newsletter'),
    ('bed36105-be90-4f81-898e-222d4cdb0d08'::uuid, 'editorial', 1, 'term',  'Which includes 1 editorial'),
    ('06572f93-128f-4c3c-8576-b061413dcee7'::uuid, 'editorial', 1, 'term',  'Featured article')
  ) AS v(contract_id, kind, quantity, per, terms) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = r.contract_id) THEN
      RAISE EXCEPTION 'contract % not found', r.contract_id;
    END IF;
    INSERT INTO public.newsletter_promises (organization_id, contract_id, business_id, kind, quantity, per, notes)
    SELECT org, c.id, c.business_id, r.kind, r.quantity, r.per, tag || ': "' || r.terms || '"'
    FROM public.contracts c WHERE c.id = r.contract_id;
  END LOOP;
END $$;
