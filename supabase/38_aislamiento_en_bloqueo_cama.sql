-- ============================================================
-- Migración 38: agregar 'AISLAMIENTO' como causa de bloqueo de cama
-- ============================================================
-- Añade el valor "AISLAMIENTO" al CHECK de camas.causa_no_ocupacion
-- para casos donde una cama queda inutilizable temporalmente porque
-- el paciente anterior requería precauciones (cuarto en proceso de
-- limpieza terminal, descontaminación, etc.).
-- ============================================================

ALTER TABLE camas DROP CONSTRAINT IF EXISTS ck_camas_causa_no_ocupacion;
ALTER TABLE camas ADD CONSTRAINT ck_camas_causa_no_ocupacion
  CHECK (
    bloqueada = FALSE
    OR causa_no_ocupacion IN (
      'SIN CAMA', 'DESCOMPUESTA', 'SIN COLCHÓN', 'EN REPARACIÓN',
      'AISLAMIENTO', 'OTRA'
    )
  );
