-- Undo the contacts Tom approved on 29 Oct 2026 ("Yes, both"): Joe (CYKL HAUS BOUTIQUE),
-- Dr Harry James (DR HARRY CLINIC), Ashleigh Thompson made active (KINGS HOUSE SPORTS GROUND),
-- Rosy (Rozies), and the new Antonio Kehtar (Beehive Cafe).
-- Before-images in cc_phase0_backup, reason 'stage11c contacts 2026-10-29'.
UPDATE public.contacts c
SET name = k.before_row->>'name',
    role = k.before_row->>'role',
    phones = k.before_row->'phones',
    is_active = (k.before_row->>'is_active')::boolean,
    name_is_placeholder = (k.before_row->>'name_is_placeholder')::boolean,
    updated_at = now()
FROM public.cc_phase0_backup k
WHERE k.reason = 'stage11c contacts 2026-10-29' AND k.table_name = 'contacts'
  AND c.id = k.row_id AND NOT (k.before_row ? 'inserted');

DELETE FROM public.contacts c
USING public.cc_phase0_backup k
WHERE k.reason = 'stage11c contacts 2026-10-29' AND k.table_name = 'contacts'
  AND c.id = k.row_id AND k.before_row ? 'inserted';
