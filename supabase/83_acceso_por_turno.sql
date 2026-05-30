-- ============================================================
-- Migración 83: Restricción de acceso por turno — flag de excepción
--               acceso_24_7 + grupo_nocturno (rotación A/B) en perfiles.
-- ------------------------------------------------------------
-- Dictado del subjefe: gestores del cuidado / jefes de servicio (rol
-- 'gestor') y operativos (rol 'enfermera') solo deben poder ENTRAR al censo
-- dentro de su turno asignado (turno_principal), más 1:30 de tolerancia al
-- terminar para cerrar pendientes. jefe / subjefe / supervisor entran 24/7.
--
-- NOCTURNO A/B: el turno nocturno se parte en dos grupos que se alternan por
-- la PARIDAD de la fecha. En junio (mes par) las noches de día NON las cubre
-- el grupo A y las pares el B; la regla se voltea cada mes (julio: A pares,
-- B nones; etc.). Equivale a: A cubre la noche cuando (día + mes) es impar.
-- La fecha que cuenta es la de INICIO de la noche (la noche cruza medianoche).
--
-- DÓNDE SE APLICA: la restricción de horario se hace en el FRONTEND
-- (src/utils/accesoHorario.ts + pantalla de bloqueo en src/App.tsx), usando
-- las fronteras oficiales de turno (mig 67) en hora local del Pacífico
-- (America/Mazatlan). Esta migración NO impone RLS por hora; solo agrega las
-- palancas para asignar grupo y para EXCEPTUAR a una cuenta puntual.
--
-- Qué hace (idempotente):
--   1) perfiles.acceso_24_7 (BOOLEAN, default FALSE): si TRUE, esa cuenta
--      gestor/enfermera entra 24/7 (la app la exime de la restricción). Sirve
--      para cambios de guardia, días festivos o quien deba entrar siempre.
--   2) perfiles.grupo_nocturno (CHAR(1) 'A'/'B', default NULL): grupo del
--      nocturno para quien tenga turno_principal = 'N'. NULL = no rota (entra
--      cualquier noche dentro de su ventana).
--
-- Cómo asignar grupo nocturno (ejemplos, NO se ejecutan):
--   UPDATE perfiles SET grupo_nocturno = 'A' WHERE matricula = '<matricula>';
--   UPDATE perfiles SET grupo_nocturno = 'B' WHERE matricula = '<matricula>';
-- Cómo eximir a alguien (entra 24/7):
--   UPDATE perfiles SET acceso_24_7 = TRUE WHERE matricula = '<matricula>';
--
-- Correr en el SQL Editor de Supabase (proyecto xdvvmtqjksebqoflvbhj).
-- ============================================================
BEGIN;

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS acceso_24_7 BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS grupo_nocturno CHAR(1);

-- CHECK idempotente: solo 'A', 'B' o NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'perfiles_grupo_nocturno_chk'
  ) THEN
    ALTER TABLE perfiles
      ADD CONSTRAINT perfiles_grupo_nocturno_chk
      CHECK (grupo_nocturno IS NULL OR grupo_nocturno IN ('A', 'B'));
  END IF;
END $$;

COMMENT ON COLUMN perfiles.acceso_24_7 IS
  'Si TRUE, exime a un gestor/enfermera de la restricción de acceso por turno (entra 24/7). Lo activa el administrador. La restricción se aplica en el frontend (accesoHorario.ts).';

COMMENT ON COLUMN perfiles.grupo_nocturno IS
  'Grupo del turno nocturno (A/B) para perfiles con turno_principal=N. Los grupos se alternan por paridad de la fecha de inicio de la noche (ver accesoHorario.ts). NULL = no rota.';

COMMIT;

-- ============================================================
-- POST-CHECK: gestores y enfermeras con su turno y grupo. Los que tengan
-- turno_principal NULL o vacío quedarían BLOQUEADOS fuera de 24/7 — a esos
-- asígnales turno (M/V/N/JORNADA) o ponles acceso_24_7=TRUE antes de activar
-- la restricción en producción. A los de turno 'N' asígnales grupo_nocturno
-- ('A'/'B'); si lo dejas NULL, ese nocturno entra TODAS las noches. Aparecen
-- primero los que NO tienen turno, y luego los 'N' sin grupo asignado.
-- ============================================================
SELECT id, matricula, nombre_completo, rol,
       turno_principal, grupo_nocturno, acceso_24_7, activo
FROM perfiles
WHERE rol IN ('gestor', 'enfermera')
ORDER BY (turno_principal IS NULL OR btrim(turno_principal) = '') DESC,
         (btrim(COALESCE(turno_principal,'')) = 'N' AND grupo_nocturno IS NULL) DESC,
         rol, nombre_completo;
