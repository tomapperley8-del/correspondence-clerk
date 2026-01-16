-- Test query to verify database setup
-- Run this in Supabase SQL Editor to verify everything works

-- 1. Check that tables exist
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('businesses', 'contacts', 'correspondence')
ORDER BY table_name;

-- 2. Check that RLS is enabled
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('businesses', 'contacts', 'correspondence')
ORDER BY tablename;

-- 3. Check RLS policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  cmd as operation,
  roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. Check indexes exist
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('businesses', 'contacts', 'correspondence')
ORDER BY tablename, indexname;

-- 5. Check full-text search setup
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'correspondence'
  AND column_name = 'search_vector';
