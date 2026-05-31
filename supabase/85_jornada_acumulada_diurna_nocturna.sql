-- ============================================================
-- 85 — Turnos de fin de semana: ESPECIAL / ACUMULADA, diurno / nocturno
-- ------------------------------------------------------------
-- Hasta ahora turno_principal aceptaba 'M','V','N','JORNADA' y la app trataba
-- JORNADA como "acceso sin restricción". Eso era incorrecto. Los turnos de fin
-- de semana NO son acceso libre:
--
--   ESPECIAL (Sáb/Dom + festivos), partido en diurno/nocturno:
--     ESPECIAL_D  diurno   07:00–21:00
--     ESPECIAL_N  nocturno 19:00–09:00 (cruza medianoche)
--   ACUMULADA (solo Sáb/Dom, un SOLO turno):
--     sábado 07:00–22:00; domingo 07:00 corrido hasta el lunes 09:00.
--
-- La diferencia ESPECIAL vs ACUMULADA: ESPECIAL cuenta festivos oficiales (LFT)
-- y se separa día/noche; ACUMULADA es solo fin de semana y un único bloque. La
-- lógica de ventana vive en src/utils/accesoHorario.ts; aquí solo se amplía el
-- CHECK para permitir los valores nuevos.
--
-- Compat: se SIGUEN tolerando 'JORNADA'/'JORNADA_N' y 'ACUMULADA_D'/'ACUMULADA_N'
-- (valores viejos) para no romper filas existentes; el frontend los normaliza.
--
-- Idempotente: re-crea el CHECK busque como se llame el constraint actual.
-- Correr en el SQL Editor de Supabase (proyecto Pro xdvvmtqjksebqoflvbhj)
-- ANTES de desplegar el frontend que ya entiende los turnos nuevos.
-- ============================================================
BEGIN;

-- 1) Tira cualquier CHECK que hoy restrinja turno_principal (sin asumir nombre).
DO $$
DECLARE _cn text;
BEGIN
  FOR _cn IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'perfiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%turno_principal%'
  LOOP
    EXECUTE format('ALTER TABLE perfiles DROP CONSTRAINT %I', _cn);
  END LOOP;
END $$;

-- 2) Re-crea el CHECK con los turnos de fin de semana + legacy + M/V/N.
--    Fin de semana: ESPECIAL_D/_N (Sáb/Dom + festivos) y ACUMULADA (un solo
--    turno, solo Sáb/Dom). NULL sigue permitido (sin turno -> bloqueado salvo 24/7).
ALTER TABLE perfiles
  ADD CONSTRAINT perfiles_turno_principal_check
  CHECK (turno_principal IS NULL
         OR turno_principal IN (
              'M','V','N',
              'ESPECIAL_D','ESPECIAL_N','ACUMULADA',
              -- legacy tolerados (el frontend los normaliza):
              'ACUMULADA_D','ACUMULADA_N','JORNADA','JORNADA_N'
            ));

COMMIT;

-- ============================================================
-- POST-CHECK: el constraint quedó con todos los valores.
-- ============================================================
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'perfiles'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%turno_principal%';

-- ============================================================
-- OPCIONAL (NO se ejecuta): migrar los valores legacy a explícitos.
--   UPDATE perfiles SET turno_principal = 'ESPECIAL_D' WHERE turno_principal = 'JORNADA';
--   UPDATE perfiles SET turno_principal = 'ESPECIAL_N' WHERE turno_principal = 'JORNADA_N';
-- ============================================================
