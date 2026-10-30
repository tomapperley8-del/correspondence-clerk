-- Stage 18 system alarm: replays real mornings from the heartbeat history (local copy only).
-- Run inside a transaction and rolled back; the fake pg_cron job exists only for the test.
BEGIN;
INSERT INTO cron.job (jobid, schedule, command, nodename, nodeport, database, username, active, jobname)
VALUES (990001, '50 6 * * *', 'select 1', 'localhost', 5432, 'postgres', 'postgres', true, 'test-morning-pipeline');
INSERT INTO cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
VALUES (990001, 990001, 1, 'postgres', 'postgres', 'select 1', 'succeeded', '1 row', '2026-10-26 06:50+00', '2026-10-26 06:50:05+00'),
       (990001, 990002, 1, 'postgres', 'postgres', 'select 1', 'failed', 'ERROR: boom', '2026-10-27 06:50+00', '2026-10-27 06:50:05+00');

SELECT 'Mon 26 07:00 (weekend before: no miss expected)' AS morning, job_key, line FROM system_alarm('2026-10-26 07:00+00') WHERE missed AND job_key LIKE 'routine:%'
UNION ALL
SELECT 'Tue 27 07:00 (Mon 26 missed)', job_key, line FROM system_alarm('2026-10-27 07:00+00') WHERE missed AND (job_key LIKE 'routine:%' OR job_key LIKE 'cron:test%')
UNION ALL
SELECT 'Wed 28 07:00 (Mon 26 and Tue 27 missed)', job_key, line FROM system_alarm('2026-10-28 07:00+00') WHERE missed AND (job_key LIKE 'routine:%' OR job_key LIKE 'cron:test%')
UNION ALL
SELECT 'Thu 29 07:00 (ran again Wed 28: Tue 27 no longer shown)', job_key, line FROM system_alarm('2026-10-29 07:00+00') WHERE missed AND job_key LIKE 'routine:%'
UNION ALL
SELECT 'Thu 29 11:00 (ran again on 28th: clear)', job_key, line FROM system_alarm('2026-10-29 11:00+00') WHERE missed AND job_key LIKE 'routine:%';
ROLLBACK;
