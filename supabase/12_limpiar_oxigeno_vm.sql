-- ============================================================
-- LIMPIEZA: Ventilacion Mecanica NO es oxigenoterapia
--
-- El catalogo_oxigeno incluia historicamente 'VM' como una
-- modalidad mas. En el modelo actual, VM es un DISPOSITIVO
-- (tipo=dispositivo) y la oxigenoterapia es solo modalidades
-- de aporte de O2 (puntas, mascarilla, etc).
--
-- Este script:
--   1. Cancela los eventos existentes tipo=oxigeno codigo=VM
--      (no se borra: el log es inmutable, solo Cancelada).
--      Cada paciente que tenia VM en oxigeno ya tiene VM en
--      dispositivo (la migracion creo ambos), asi que no se
--      pierde el dato clinico.
--   2. Desactiva 'VM' en catalogo_oxigeno (activo=false) para
--      que ya no aparezca como opcion en otras pantallas.
--
-- Idempotente.
-- ============================================================

-- 1) Cancelar eventos existentes
UPDATE evento_apoyo_paciente
SET estado          = 'Cancelada',
    actualizado_en  = NOW(),
    observaciones   = COALESCE(observaciones, '')
                       || ' [Cancelado: VM movido a tipo=dispositivo]'
WHERE tipo  = 'oxigeno'
  AND codigo = 'VM'
  AND estado <> 'Cancelada';

-- 2) Desactivar VM en catalogo_oxigeno (si existe la columna activo)
-- Si tu tabla no tiene 'activo', comenta este UPDATE.
UPDATE catalogo_oxigeno
SET activo = false
WHERE codigo = 'VM';

-- Verificacion: eventos cancelados
SELECT
  COUNT(*) AS eventos_cancelados_vm_oxigeno
FROM evento_apoyo_paciente
WHERE tipo = 'oxigeno'
  AND codigo = 'VM'
  AND estado = 'Cancelada';

-- Verificacion: VM ya no aparece como activo en catalogo
SELECT codigo, nombre, activo
FROM catalogo_oxigeno
WHERE codigo = 'VM';
