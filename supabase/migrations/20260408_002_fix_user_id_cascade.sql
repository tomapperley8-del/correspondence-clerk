-- Fix correspondence.user_id foreign key: change ON DELETE RESTRICT to ON DELETE SET NULL
-- This allows user accounts to be deleted without being blocked by correspondence rows.
-- Correspondence is org-scoped data and survives user deletion (org_id is the real owner).

ALTER TABLE correspondence
  DROP CONSTRAINT IF EXISTS correspondence_user_id_fkey;

ALTER TABLE correspondence
  ADD CONSTRAINT correspondence_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;
