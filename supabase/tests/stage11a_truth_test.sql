-- Stage 11a: truth layer checks. Runs in a transaction and rolls back.
BEGIN;
CREATE TEMP TABLE r (n serial, ok boolean, what text);
DO $$
DECLARE p uuid; f uuid; o uuid; s text; c uuid; k int;
BEGIN
  SELECT organization_id INTO o FROM businesses LIMIT 1;
  -- a Prospect with no contracts
  SELECT id INTO p FROM v_businesses WHERE status = 'Prospect' AND deal_state = 'none' AND is_commercial IS NOT FALSE LIMIT 1;
  INSERT INTO contracts (business_id, organization_id, membership_type, contract_start, contract_end, is_current)
  VALUES (p, o, 'club_card', cc_today() - 10, cc_today() + 355, true) RETURNING id INTO c;
  SELECT status INTO s FROM businesses WHERE id = p;
  INSERT INTO r(ok, what) VALUES (s = 'Active', 'new contract makes a Prospect Active (stored): ' || s);
  SELECT status INTO s FROM v_businesses WHERE id = p;
  INSERT INTO r(ok, what) VALUES (s = 'Active', 'and derived: ' || s);
  -- ended 30 days ago: still Active (grace)
  UPDATE contracts SET contract_start = cc_today() - 395, contract_end = cc_today() - 30 WHERE id = c;
  SELECT status INTO s FROM businesses WHERE id = p;
  INSERT INTO r(ok, what) VALUES (s = 'Active', 'ended 30 days ago is Active: ' || s);
  -- not renewing: Former
  UPDATE businesses SET renewal_stage = 'not_renewing' WHERE id = p;
  PERFORM refresh_business_truth(p);
  SELECT status INTO s FROM businesses WHERE id = p;
  INSERT INTO r(ok, what) VALUES (s = 'Former', 'ended 30 days ago and not renewing is Former: ' || s);
  UPDATE businesses SET renewal_stage = 'not_started' WHERE id = p;
  -- ended 61 days ago: Former
  UPDATE contracts SET contract_end = cc_today() - 61 WHERE id = c;
  SELECT status INTO s FROM businesses WHERE id = p;
  INSERT INTO r(ok, what) VALUES (s = 'Former', 'ended 61 days ago is Former: ' || s);
  -- deleting the only contract: back to Prospect? No: the old stored status counts as history
  DELETE FROM contracts WHERE id = c;
  SELECT status INTO s FROM businesses WHERE id = p;
  INSERT INTO r(ok, what) VALUES (s = 'Former', 'contract deleted keeps Former (history): ' || s);
  -- kept statuses
  SELECT id INTO f FROM businesses WHERE status = 'Not a business' LIMIT 1;
  SELECT status INTO s FROM v_businesses WHERE id = f;
  INSERT INTO r(ok, what) VALUES (s = 'Not a business', 'Not a business stays');
  SELECT count(*) INTO k FROM v_businesses v JOIN org_business_types t ON t.org_id = v.organization_id AND t.value = v.business_type
   WHERE NOT t.is_commercial AND v.status IS DISTINCT FROM v.status_stored;
  INSERT INTO r(ok, what) VALUES (k = 0, 'Internal/Community types keep their status: ' || k || ' differ');
  -- Unreviewed with no deal stays
  SELECT count(*) INTO k FROM v_businesses WHERE status_stored = 'Unreviewed' AND deal_state IN ('none','ended') AND status <> 'Unreviewed';
  INSERT INTO r(ok, what) VALUES (k = 0, 'Unreviewed with no live deal stays Unreviewed');
  -- a manual main contact wins
  SELECT count(*) INTO k FROM contacts k2 JOIN v_businesses v ON v.id = k2.business_id WHERE k2.is_primary AND v.main_contact_id <> k2.id;
  INSERT INTO r(ok, what) VALUES (k = 0, 'manual is_primary is the main contact everywhere');
  SELECT count(*) INTO k FROM v_businesses v JOIN contacts k2 ON k2.id = v.main_contact_id
   WHERE NOT v.main_contact_is_manual AND (k2.name_is_placeholder OR NOT k2.is_active);
  INSERT INTO r(ok, what) VALUES (k = 0, 'automatic main contacts are named and active');
  SELECT (SELECT count(*) FROM v_businesses) - (SELECT count(*) FROM businesses) INTO k;
  INSERT INTO r(ok, what) VALUES (k = 0, 'one row per business');
END $$;
SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, what FROM r ORDER BY n;
ROLLBACK;
