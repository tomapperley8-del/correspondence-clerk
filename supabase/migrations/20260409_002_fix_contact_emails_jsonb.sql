-- Fix contacts.emails and contacts.phones stored as JSONB strings instead of JSONB arrays.
--
-- Root cause: createContact/updateContact called JSON.stringify() before inserting,
-- which stored values as JSONB strings (e.g. "[\"a@b.com\"]") rather than native
-- JSONB arrays (e.g. ["a@b.com"]). The @> (contains) operator requires native arrays,
-- so matchBusinessFromEmail and findEmailMatch could never find these contacts via DB query.
--
-- This migration casts string-typed JSONB values to proper arrays by parsing them.

-- #>> '{}' extracts the scalar text content of a JSONB string (strips outer quotes),
-- then ::jsonb re-parses it — turning "[\"a@b.com\"]" into ["a@b.com"].
UPDATE public.contacts
SET emails = (emails #>> '{}')::jsonb
WHERE jsonb_typeof(emails) = 'string';

UPDATE public.contacts
SET phones = (phones #>> '{}')::jsonb
WHERE jsonb_typeof(phones) = 'string';
