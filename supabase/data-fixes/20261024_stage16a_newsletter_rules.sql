-- Stage 16a: Tom's newsletter review (24 Oct 2026) as standing match rules. Run after migration
-- 20261024_003_newsletter. The next newsletter read applies them to every stored issue and every new one.
--
-- Tom's notes:
--   Bridget Osborne  no  "she's our editor, not a relevant business"
--   THE GEORGE IV    no  "jazz at the george IV is a seperate event we organise ... can largely be ignored"
--                        -> ignore the phrase, keep George IV itself matchable
--   THE GUNNERSBURY  no  "the gunnersbury is a pub ... the park and council are a seperate thing"
--   The Kitchen      no  "be hyper careful with this ... the word kitchen, and other places with kitchen in the name"
--   Gtech            no  "Gtech community stadium should go under brentford fc, not its own business" -> alias
--   FRASER & CO, Parliament  no
--   yes, all: Hounslow Council, THE TABARD, Rnli, KILLIK & CO, Reform, THE DUCHESS, ANNAPURNA, BackPedal,
--             BRONZO, Dusra, Mirtala, RAYUELA, TARANTELLA, THE HOUND, THE ITALIANS, TROTTERS
--
-- Refuses to run twice. Undo: 20261024_stage16a_newsletter_rules_undo.sql
DO $$
DECLARE
  org uuid := '00000000-0000-0000-0000-000000000001';
  tag text := 'Tom review 24 Oct 2026';
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.newsletter_match_rules WHERE note LIKE tag || '%') THEN
    RAISE EXCEPTION 'already run: rules tagged "%" exist', tag;
  END IF;

  FOR r IN SELECT * FROM (VALUES
    ('never',  '3e054f3d-6dbe-434b-b8f7-9fa4ad8ea56a'::uuid, 'Bridget Osborne',  NULL, 'our editor, not a business'),
    ('never',  'a568032c-b4e0-48fa-8924-06f4cc2b3d3f'::uuid, 'The Kitchen',      NULL, 'the word kitchen is too common'),
    ('never',  '3e10080d-fc8d-450b-86b8-949de92e155a'::uuid, 'THE GUNNERSBURY',  NULL, 'Gunnersbury Park and the council are separate'),
    ('never',  'ad9f75da-987b-4556-acd3-95a53a34f76a'::uuid, 'Gtech',            NULL, 'the Gtech Community Stadium counts for Brentford FC'),
    ('never',  '05bec353-8513-45a2-bcd4-75c7a0be3a7d'::uuid, 'FRASER & CO',      NULL, NULL),
    ('never',  'e755022d-6105-444e-9849-ee7c23ad257f'::uuid, 'Parliament',       NULL, NULL),
    ('alias',  '27db1c1d-ae21-4ea9-b04c-a9af4116c670'::uuid, 'BRENTFORD FC',     'Gtech Community Stadium', 'Brentford FC''s ground'),
    ('alias',  '27db1c1d-ae21-4ea9-b04c-a9af4116c670'::uuid, 'BRENTFORD FC',     'Gtech', 'Brentford FC''s ground'),
    ('always', '2604bba3-386c-419e-ab81-239074894a2b'::uuid, 'Hounslow Council', NULL, NULL),
    ('always', '8406c145-2fc2-4f87-ab56-6fd8b0722fa7'::uuid, 'THE TABARD',       NULL, NULL),
    ('always', '8d682fb7-8197-401c-b6a8-879d7fef9505'::uuid, 'Rnli',             NULL, NULL),
    ('always', '56e37c38-0620-44de-97ab-19105b9a79c5'::uuid, 'KILLIK & CO',      NULL, NULL),
    ('always', '71e33ce8-6cf8-4968-8709-2f32a9a8b4ec'::uuid, 'Reform',           NULL, NULL),
    ('always', '20e34ad7-a6c2-414e-b727-b7cc54bc22a1'::uuid, 'THE DUCHESS',      NULL, NULL),
    ('always', '7e071de2-6940-4be5-9e3d-03e5a68dcb6a'::uuid, 'ANNAPURNA',        NULL, NULL),
    ('always', 'd64c0ee2-c3c6-4417-9d28-d86eb6409ead'::uuid, 'BackPedal',        NULL, NULL),
    ('always', '32502a90-16ae-4b67-98d6-7e57464e2739'::uuid, 'BRONZO',           NULL, NULL),
    ('always', 'a876be7a-ed98-4517-aa1a-a030f3acc5b7'::uuid, 'Dusra',            NULL, NULL),
    ('always', '9484a768-19ad-4e2b-b1ff-d7ffc98d3f7f'::uuid, 'Mirtala',          NULL, NULL),
    ('always', '27cacead-4105-4021-9a9b-d460d10cefab'::uuid, 'RAYUELA',          NULL, NULL),
    ('always', '3c37480f-20c3-434a-ab76-fd9b0d6ed67d'::uuid, 'TARANTELLA',       NULL, NULL),
    ('always', '5a718b90-fdc3-4f60-a6d5-6d80cce1ef7a'::uuid, 'THE HOUND',        NULL, NULL),
    ('always', '30d22594-18d5-4ded-8b47-f58ca831528e'::uuid, 'THE ITALIANS',     NULL, NULL),
    ('always', '1eb5a52e-9566-4d24-b3b1-40f3b592a8e6'::uuid, 'TROTTERS',         NULL, NULL)
  ) AS v(kind, business_id, expect_name, phrase, why)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = r.business_id AND b.name = r.expect_name AND b.merged_into IS NULL) THEN
      RAISE EXCEPTION 'business % is not "%" (or was merged): stopping, nothing written', r.business_id, r.expect_name;
    END IF;
    INSERT INTO public.newsletter_match_rules (organization_id, kind, business_id, phrase, note)
    VALUES (org, r.kind, r.business_id, r.phrase, tag || coalesce(': ' || r.why, ''));
  END LOOP;

  INSERT INTO public.newsletter_match_rules (organization_id, kind, phrase, note) VALUES
    (org, 'ignore_phrase', 'Jazz at George IV', tag || ': our own jazz nights, not a mention of the pub'),
    (org, 'ignore_phrase', 'Jazz at the George IV', tag || ': our own jazz nights, not a mention of the pub');

  -- Matches made before these rules are re-found on the next read; clearing matched_at makes it re-match
  UPDATE public.newsletter_issues SET matched_at = NULL WHERE organization_id = org;
  RAISE NOTICE 'rules: %', (SELECT count(*) FROM public.newsletter_match_rules WHERE note LIKE tag || '%');
END $$;
