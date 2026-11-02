-- Applied to Supabase project dmrwptoddklmorshyvai.
-- This intentionally does not read or write any application / patient data.
CREATE FUNCTION public.painel_psico_keepalive()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 1::integer;
$$;

REVOKE ALL ON FUNCTION public.painel_psico_keepalive() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.painel_psico_keepalive() TO anon;

COMMENT ON FUNCTION public.painel_psico_keepalive() IS
  'Read-only endpoint for external scheduled database activity. Returns only integer 1 and accesses no application data.';
