-- ============================================================
-- Migración 60: Anular vale de la bitácora de supervisión
-- ============================================================
-- El DELETE de recetas_controladas está bloqueado por RLS (libro de
-- controlados). Para "eliminar" un vale se ANULA: queda en el historial
-- con motivo, y si ya estaba 'canjeada' se revierte el movimiento de
-- stock 'utilizado' que generó automáticamente el canje (migración 51).
--
-- Se reutilizan las columnas cancelada_en/por/motivo ya existentes
-- (migración 47) + se añade cancelada_nombre para mostrar quién anuló
-- sin un JOIN extra en la vista.
-- ============================================================

ALTER TABLE recetas_controladas
  ADD COLUMN IF NOT EXISTS cancelada_nombre TEXT;

-- RPC: anular con reverso de stock. SECURITY DEFINER para poder borrar el
-- movimiento auto-generado (el DELETE de movimientos no está abierto a RLS).
CREATE OR REPLACE FUNCTION fn_anular_receta_controlada(p_id UUID, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _rc      recetas_controladas%ROWTYPE;
  _perfil  perfiles%ROWTYPE;
BEGIN
  SELECT * INTO _perfil FROM perfiles WHERE id = auth.uid();
  IF _perfil.id IS NULL OR NOT _perfil.activo
     OR _perfil.rol NOT IN ('jefe','subjefe','supervisor') THEN
    RAISE EXCEPTION 'No autorizado para anular vales';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Debe indicar el motivo de la anulación';
  END IF;

  SELECT * INTO _rc FROM recetas_controladas WHERE id = p_id;
  IF _rc.id IS NULL THEN
    RAISE EXCEPTION 'Vale no encontrado';
  END IF;
  IF _rc.cancelada_en IS NOT NULL THEN
    RETURN;  -- ya estaba anulada, idempotente
  END IF;

  -- Si ya se había canjeado, revertir la salida de stock generada por el canje.
  IF _rc.estado_aprobacion = 'canjeada' THEN
    DELETE FROM movimientos_psicotropicos
     WHERE receta_id = p_id AND tipo = 'utilizado';
  END IF;

  UPDATE recetas_controladas
     SET cancelada_en     = NOW(),
         cancelada_por    = auth.uid(),
         cancelada_nombre = _perfil.nombre_completo,
         cancelada_motivo = btrim(p_motivo)
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_anular_receta_controlada(UUID, TEXT) TO authenticated;

-- Exponer los campos de anulación en la vista de la bitácora.
CREATE OR REPLACE VIEW v_bitacora_supervision AS
SELECT
  rc.id,
  rc.folio,
  rc.creado_en,
  (rc.creado_en AT TIME ZONE 'America/Mazatlan')::date AS fecha_dia,
  fn_turno_de_fecha(rc.creado_en) AS turno,
  rc.estado_aprobacion,
  rc.aprobado_en,
  rc.aprobado_nombre,
  rc.canjeado_en,
  rc.rechazo_motivo,
  rc.observaciones,
  -- paciente
  rc.paciente_cama,
  rc.paciente_nombre,
  rc.paciente_edad,
  rc.paciente_edad_unidad,
  rc.paciente_genero,
  rc.paciente_nss_curp,
  rc.paciente_diagnostico,
  rc.paciente_subservicio,
  s.codigo AS servicio_codigo,
  s.nombre AS servicio_nombre,
  -- medicamento
  rc.medicamento_nombre,
  rc.medicamento_grupo,
  rc.dosis,
  rc.via,
  rc.frecuencia,
  rc.cantidad_numero,
  rc.cantidad_letra,
  -- médico y enfermería
  rc.medico_nombre,
  rc.medico_cedula,
  rc.enfermera_nombre,
  rc.enfermera_matricula,
  rc.enfermera_rol,
  -- anulación
  rc.cancelada_en,
  rc.cancelada_motivo,
  rc.cancelada_nombre
FROM recetas_controladas rc
LEFT JOIN servicios s ON s.id = rc.servicio_id;

-- POST-CHECK
SELECT 'columna cancelada_nombre' AS check, COUNT(*)::bigint FROM information_schema.columns
  WHERE table_name='recetas_controladas' AND column_name='cancelada_nombre'
UNION ALL
SELECT 'fn_anular existe', COUNT(*)::bigint FROM pg_proc WHERE proname='fn_anular_receta_controlada';
