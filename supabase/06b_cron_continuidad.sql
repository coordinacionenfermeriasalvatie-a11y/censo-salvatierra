-- ============================================================
-- pg_cron: scheduling de continuidad por turno
-- ============================================================
-- Requisito previo: extension pg_cron habilitada en Supabase
-- Dashboard > Database > Extensions > pg_cron.
--
-- Turnos en hora local Mazatlan (UTC-7):
--   M inicia 08:00 local = 15:00 UTC
--   V inicia 14:01 local = 21:01 UTC
--   N inicia 20:01 local = 03:01 UTC (del dia siguiente local)
-- Programamos al minuto siguiente del inicio para asegurar que
-- fn_turno_actual() devuelva el turno nuevo.
-- ============================================================

-- Verificar que pg_cron este habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RAISE EXCEPTION 'pg_cron no esta habilitado. Activalo en Supabase Dashboard > Database > Extensions antes de aplicar este archivo.';
  END IF;
END $$;

-- Borrar jobs viejos con estos nombres si existen (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'continuidad_turno_M') THEN
    PERFORM cron.unschedule('continuidad_turno_M');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'continuidad_turno_V') THEN
    PERFORM cron.unschedule('continuidad_turno_V');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'continuidad_turno_N') THEN
    PERFORM cron.unschedule('continuidad_turno_N');
  END IF;
END $$;

-- Programar 3 jobs (uno por turno) en hora UTC
SELECT cron.schedule(
  'continuidad_turno_M',
  '1 15 * * *',  -- 15:01 UTC = 08:01 Mazatlan
  $$ SELECT fn_continuidad_turno_actual(); $$
);

SELECT cron.schedule(
  'continuidad_turno_V',
  '2 21 * * *',  -- 21:02 UTC = 14:02 Mazatlan
  $$ SELECT fn_continuidad_turno_actual(); $$
);

SELECT cron.schedule(
  'continuidad_turno_N',
  '2 3 * * *',   -- 03:02 UTC = 20:02 Mazatlan
  $$ SELECT fn_continuidad_turno_actual(); $$
);

-- Verificar que se programaron
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname LIKE 'continuidad_turno_%'
ORDER BY jobname;
