-- One-off fix: recompute is_club_card / is_advertiser for all businesses from contracts
UPDATE businesses b
SET
  is_club_card  = EXISTS (
    SELECT 1 FROM contracts c
    WHERE c.business_id = b.id AND c.is_current = true AND c.membership_type = 'club_card'
  ),
  is_advertiser = EXISTS (
    SELECT 1 FROM contracts c
    WHERE c.business_id = b.id AND c.is_current = true AND c.membership_type = 'advertiser'
  );

-- Trigger: keep flags in sync after any contract change
CREATE OR REPLACE FUNCTION sync_business_flags_from_contracts()
RETURNS TRIGGER AS $$
DECLARE
  target_id UUID;
BEGIN
  target_id := COALESCE(NEW.business_id, OLD.business_id);
  UPDATE businesses
  SET
    is_club_card  = EXISTS (
      SELECT 1 FROM contracts
      WHERE business_id = target_id AND is_current = true AND membership_type = 'club_card'
    ),
    is_advertiser = EXISTS (
      SELECT 1 FROM contracts
      WHERE business_id = target_id AND is_current = true AND membership_type = 'advertiser'
    )
  WHERE id = target_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contracts_sync_business_flags ON contracts;
CREATE TRIGGER contracts_sync_business_flags
AFTER INSERT OR UPDATE OR DELETE ON contracts
FOR EACH ROW EXECUTE FUNCTION sync_business_flags_from_contracts();
