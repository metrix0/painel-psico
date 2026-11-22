-- Painel Psico: low-cost, isolated heartbeat for Free-plan inactivity monitoring.
-- Run with the Supabase SQL editor / connected database management tool.
-- No access to patient data. This does not guarantee that Supabase will never
-- pause a Free project: paid plans are the only documented no-pause guarantee.
CREATE TABLE IF NOT EXISTS psico_private.keepalive_heartbeat (
  id smallint PRIMARY KEY CHECK (id=1),
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  ping_count bigint NOT NULL DEFAULT 0 CHECK (ping_count>=0)
);
ALTER TABLE psico_private.keepalive_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE psico_private.keepalive_heartbeat FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.painel_psico_keepalive()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=''
AS $keepalive$
BEGIN
  -- A bounded genuine DB write; no clinical tables are queried or modified.
  -- Prevent accidental or unauthorized callers from causing excessive writes.
  INSERT INTO psico_private.keepalive_heartbeat AS heartbeat (id,last_ping_at,ping_count)
    VALUES (1,clock_timestamp(),1)
  ON CONFLICT (id) DO UPDATE
    SET last_ping_at=EXCLUDED.last_ping_at,
        ping_count=heartbeat.ping_count+1
    WHERE heartbeat.last_ping_at < clock_timestamp()-interval '5 minutes';
  RETURN 1;
END;
$keepalive$;
REVOKE ALL ON FUNCTION public.painel_psico_keepalive() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.painel_psico_keepalive() TO anon, authenticated, service_role;

-- Verification from an authorized admin SQL session:
-- SELECT public.painel_psico_keepalive();
-- SELECT last_ping_at,ping_count FROM psico_private.keepalive_heartbeat;
-- Expected: the single row has a recent timestamp and a positive count.
