-- Rollback for 20261030_002_system_alarm (Stage 18). Nothing else depends on these.
DROP VIEW IF EXISTS public.v_system_alarm;
DROP FUNCTION IF EXISTS public.system_alarm(timestamptz);
