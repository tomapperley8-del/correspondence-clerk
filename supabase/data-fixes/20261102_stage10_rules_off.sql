-- Stage 10 (3): switch off the task engine's reply, renewal and invoice rules. The app hides their tasks,
-- the desk email and the daily desk runbook do not read them (checked 2 Nov 2026), and Today works
-- from v_business_attention. Open tasks of these rules are deleted (no delete trigger; the tick
-- write-back trigger only fires on update). Before-images: cc_phase0_backup, reason 'stage10 rules off 2026-11-02'.
BEGIN;
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'task_rules', md5(r.id)::uuid, to_jsonb(r), 'stage10 rules off 2026-11-02'
FROM task_rules r
WHERE r.id IN ('reply_needed','renewal_due','renewal_lapsed','invoice_overdue','invoice_due_soon','unrecorded_renewal') AND r.enabled;

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'tasks', t.id, to_jsonb(t), 'stage10 rules off 2026-11-02'
FROM tasks t
WHERE t.status = 'open' AND t.signal_meta->>'rule_id' IN ('reply_needed','renewal_due','renewal_lapsed','invoice_overdue','invoice_due_soon','unrecorded_renewal');

DELETE FROM tasks t
WHERE t.status = 'open' AND t.signal_meta->>'rule_id' IN ('reply_needed','renewal_due','renewal_lapsed','invoice_overdue','invoice_due_soon','unrecorded_renewal');

UPDATE task_rules SET enabled = false
WHERE id IN ('reply_needed','renewal_due','renewal_lapsed','invoice_overdue','invoice_due_soon','unrecorded_renewal');
COMMIT;
