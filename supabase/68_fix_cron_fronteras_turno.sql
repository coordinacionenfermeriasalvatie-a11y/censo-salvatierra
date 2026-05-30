-- ============================================================
-- 68_fix_cron_fronteras_turno.sql
-- Reprograma el cron de continuidad para las fronteras OFICIALES
-- de turno (migración 67): M 08:00 / V 14:30 / N 20:30 (Mazatlan, UTC-7).
--
-- POR QUÉ: el cron 06b disparaba a 08:01 / 14:02 / 20:02 Mazatlan,
-- alineado con las fronteras VIEJAS (07/14/20). Tras la 67,
-- fn_turno_actual() a las 14:02 todavía devuelve M (V inicia 14:30)
-- y a las 20:02 todavía devuelve V (N inicia 20:30). Resultado:
-- el job "V" resembraba M y el turno N NUNCA se sembraba.
--
-- FIX: disparar 1 min después de cada frontera nueva:
--   M 08:01 Mazatlan = 15:01 UTC  -> '1 15 * * *'   (sin cambio)
--   V 14:31 Mazatlan = 21:31 UTC  -> '31 21 * * *'
--   N 20:31 Mazatlan = 03:31 UTC  -> '31 3 * * *'   (del día siguiente UTC)
-- Idempotente: desprograma y reprograma.
-- ============================================================

-- Verificar que pg_cron esté habilitado
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron no está habilitado. Actívalo en Supabase Dashboard > Database > Extensions antes de aplicar este archivo.';
  END IF;
END $$;

-- Desprogramar jobs viejos (idempotente)
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

-- Reprogramar a las fronteras OFICIALES (+1 min), en hora UTC
SELECT cron.schedule(
  'continuidad_turno_M',
  '1 15 * * *',   -- 15:01 UTC = 08:01 Mazatlan (frontera M 08:00)
  $$ SELECT fn_continuidad_turno_actual(); $$
);

SELECT cron.schedule(
  'continuidad_turno_V',
  '31 21 * * *',  -- 21:31 UTC = 14:31 Mazatlan (frontera V 14:30)
  $$ SELECT fn_continuidad_turno_actual(); $$
);

SELECT cron.schedule(
  'continuidad_turno_N',
  '31 3 * * *',   -- 03:31 UTC = 20:31 Mazatlan (frontera N 20:30)
  $$ SELECT fn_continuidad_turno_actual(); $$
);

-- Verificar que quedaron con el horario nuevo
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname LIKE 'continuidad_turno_%'
ORDER BY jobname;
