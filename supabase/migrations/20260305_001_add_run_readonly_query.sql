-- Database function for executing read-only queries from the AI chat
-- Uses a security definer function with explicit read-only transaction
CREATE OR REPLACE FUNCTION run_readonly_query(
  query_text TEXT,
  org_id UUID,
  row_limit INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10s'
AS $$
DECLARE
  result JSONB;
  clean_query TEXT;
BEGIN
  -- Strip whitespace and trailing semicolons
  clean_query := regexp_replace(TRIM(query_text), ';+\s*$', '');

  -- Validate: only SELECT or WITH allowed
  IF NOT (clean_query ~* '^(SELECT|WITH)\b') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Reject dangerous keywords
  IF clean_query ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b' THEN
    RAISE EXCEPTION 'Query contains forbidden keywords';
  END IF;

  -- Execute in a read-only transaction
  SET LOCAL transaction_read_only = ON;

  -- Wrap the query with a row limit and execute with org_id as $1
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (SELECT * FROM (%s) sub LIMIT %s) t',
    clean_query,
    row_limit
  )
  INTO result
  USING org_id;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION run_readonly_query(TEXT, UUID, INT) TO authenticated;
