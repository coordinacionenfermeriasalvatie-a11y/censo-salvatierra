-- ============================================================
-- MIGRACION: ampliar CHECK de productividad_capturas.origen
--
-- Originalmente origen solo admite: AUTO_ING, AUTO_TURNO, MANUAL.
-- Fase A introduce dos nuevos valores escritos por triggers:
--   AUTO_EVENTO       -> fn_evento_productividad (archivo 05)
--   AUTO_CONTINUIDAD  -> fn_recomputar_continuidad (archivo 06)
--
-- Sin esta migracion los triggers fallan con:
--   "new row ... violates check constraint productividad_capturas_origen_check"
--
-- Convencion: guion BAJO (igual que AUTO_ING / AUTO_TURNO),
-- no guion (que era lo que tenian 05 y 06 originalmente).
--
-- Idempotente.
-- ============================================================

ALTER TABLE productividad_capturas
  DROP CONSTRAINT IF EXISTS productividad_capturas_origen_check;

ALTER TABLE productividad_capturas
  ADD CONSTRAINT productividad_capturas_origen_check
  CHECK (origen IN (
    'AUTO_ING',
    'AUTO_TURNO',
    'MANUAL',
    'AUTO_EVENTO',
    'AUTO_CONTINUIDAD'
  ));

COMMENT ON CONSTRAINT productividad_capturas_origen_check ON productividad_capturas IS
  'Origenes permitidos. AUTO_EVENTO y AUTO_CONTINUIDAD anadidos en Fase A para triggers de evento_apoyo_paciente.';
