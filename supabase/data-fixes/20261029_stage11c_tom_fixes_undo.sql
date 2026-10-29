-- Undo the Stage 11c Data health fixes Tom asked for on 29 Oct 2026 (applied on live that day):
-- LITTLE BIRD and STILE SASH WINDOWS & DOORS Club Card deals marked not current ("isn't active"),
-- and ORANGE TREE THEATRE RICHMOND's stale stored last_contacted_at cleared.
-- Before-images are in cc_phase0_backup with reason 'stage11c tom_fixes 2026-10-29'.
UPDATE public.contracts c
SET is_current = (k.before_row->>'is_current')::boolean, updated_at = now()
FROM public.cc_phase0_backup k
WHERE k.reason = 'stage11c tom_fixes 2026-10-29' AND k.table_name = 'contracts' AND c.id = k.row_id;

UPDATE public.businesses b
SET last_contacted_at = (k.before_row->>'last_contacted_at')::timestamptz
FROM public.cc_phase0_backup k
WHERE k.reason = 'stage11c tom_fixes 2026-10-29' AND k.table_name = 'businesses'
  AND b.id = k.row_id AND b.name = 'ORANGE TREE THEATRE RICHMOND';
