UPDATE contracts c SET is_ongoing = false
WHERE c.id IN (SELECT row_id::uuid FROM cc_phase0_backup WHERE reason = 'contract_ongoing 2026-11-02');
DELETE FROM cc_phase0_backup WHERE reason = 'contract_ongoing 2026-11-02';
