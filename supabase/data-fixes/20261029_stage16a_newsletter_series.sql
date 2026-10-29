-- Stage 16a, the Newsletter tab: series tracked like contributors (Tom, 29 Oct 2026: "Yes, build both").
-- Each is found by its name or phrase in an item, capitals ignored (lib/newsletter/items-store.ts).
-- "Every" is the median gap measured across the 120 issues (plan Log, "Newsletter rhythms").
-- Refuses to run twice. Undo: 20261029_stage16a_newsletter_series_undo.sql
DO $$
DECLARE
  org uuid := '00000000-0000-0000-0000-000000000001';
  tag text := 'Stage 16a series 29 Oct 2026';
BEGIN
  IF EXISTS (SELECT 1 FROM public.newsletter_contributors WHERE notes LIKE tag || '%') THEN
    RAISE EXCEPTION 'already run: rows tagged "%" exist', tag;
  END IF;
  INSERT INTO public.newsletter_contributors (organization_id, name, column_name, business_id, aliases, expected_every_days, active, notes) VALUES
    (org, 'Volunteer stories',      'Series', NULL,                                          '{}',              70, true, tag),
    (org, 'Three Old Hacks',        'Series', NULL,                                          '{}',              28, true, tag),
    (org, 'Wild Chiswick',          'Series', '7ff793d0-6ab1-4ee0-856e-d98fc9f5211a'::uuid,  '{}',              42, true, tag),
    (org, 'Food St market',         'Market', NULL,                                          '{Food St}',       35, true, tag),
    (org, 'Chiswick Flower Market', 'Market', '47a296fb-fe72-49da-8d9a-da0fc558d702'::uuid,  '{Flower Market}', 28, true, tag)
  ON CONFLICT (organization_id, name) DO NOTHING;
END $$;
