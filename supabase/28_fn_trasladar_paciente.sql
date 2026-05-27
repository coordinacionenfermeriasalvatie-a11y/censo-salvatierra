-- ============================================================
-- Migración 28: Traslado de paciente entre camas
-- ============================================================
-- Función fn_trasladar_paciente que cubre 2 escenarios:
--
--   A) Traslado entre subservicios (ej. URG Choque → URG Observación,
--      o URG → UCI). Cuenta como EGRESO del subservicio origen e
--      INGRESO al subservicio destino. Los datos del paciente se
--      copian automáticamente (nombre, edad, NSS/CURP, dx, especialidad,
--      grupo, alergias, riesgos UPP/caídas).
--
--   B) Cambio de cama dentro del MISMO subservicio. Solo se actualiza
--      cama_id; NO cuenta como egreso ni ingreso (sería doble conteo).
--
-- Devuelve JSONB con el tipo de operación y los IDs involucrados.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_trasladar_paciente(
  _paciente_id_actual UUID,
  _cama_destino_id INTEGER,
  _capturado_por UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _paciente RECORD;
  _fc RECORD;
  _sub_origen INTEGER;
  _sub_destino INTEGER;
  _cama_origen_num TEXT;
  _cama_destino_num TEXT;
  _nuevo_id UUID;
  _motivo_traslado INTEGER;
BEGIN
  -- Validar paciente activo
  SELECT * INTO _paciente
  FROM pacientes
  WHERE id = _paciente_id_actual AND estado = 'ACTIVO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El paciente no existe o ya no está activo (puede que ya haya sido egresado)';
  END IF;

  -- Validar cama destino existe y está libre
  SELECT subservicio_id, numero_cama INTO _sub_destino, _cama_destino_num
  FROM camas
  WHERE id = _cama_destino_id AND activa = TRUE;
  IF _sub_destino IS NULL THEN
    RAISE EXCEPTION 'La cama destino no existe o no está activa';
  END IF;
  IF EXISTS (SELECT 1 FROM pacientes WHERE cama_id = _cama_destino_id AND estado = 'ACTIVO') THEN
    RAISE EXCEPTION 'La cama destino ya tiene un paciente asignado';
  END IF;
  IF EXISTS (SELECT 1 FROM camas WHERE id = _cama_destino_id AND bloqueada = TRUE) THEN
    RAISE EXCEPTION 'La cama destino está marcada como NO OCUPABLE';
  END IF;

  -- Datos cama origen
  SELECT subservicio_id, numero_cama INTO _sub_origen, _cama_origen_num
  FROM camas WHERE id = _paciente.cama_id;

  -- ================================================
  -- ESCENARIO B: mismo subservicio → solo cambia cama
  -- ================================================
  IF _sub_origen = _sub_destino THEN
    UPDATE pacientes
       SET cama_id = _cama_destino_id
     WHERE id = _paciente_id_actual;
    RETURN jsonb_build_object(
      'tipo', 'cambio_cama',
      'paciente_id', _paciente_id_actual,
      'cama_origen', _paciente.cama_id,
      'cama_destino', _cama_destino_id,
      'cama_origen_num', _cama_origen_num,
      'cama_destino_num', _cama_destino_num
    );
  END IF;

  -- ================================================
  -- ESCENARIO A: cruce de subservicios → egreso + ingreso
  -- ================================================

  -- Motivo egreso "TRASLADO" (id=4 por el catálogo)
  SELECT id INTO _motivo_traslado
  FROM catalogo_motivos_egreso
  WHERE nombre = 'TRASLADO'
  LIMIT 1;
  IF _motivo_traslado IS NULL THEN
    RAISE EXCEPTION 'Catálogo de motivos sin TRASLADO configurado';
  END IF;

  -- Tomar snapshot de formato_control para copiar riesgos/datos clínicos
  SELECT * INTO _fc
  FROM formato_control_paciente
  WHERE paciente_id = _paciente_id_actual;

  _nuevo_id := gen_random_uuid();

  -- 1) Egresar el paciente actual con motivo TRASLADO. El trigger
  --    trg_autollenar_egreso suma +1 a C04 (egresos por traslado)
  --    en el servicio origen.
  -- dias_estancia es GENERATED (no se actualiza manualmente).
  UPDATE pacientes SET
    estado = 'EGRESADO',
    fecha_egreso = CURRENT_DATE,
    hora_egreso = LOCALTIME(0)::time,
    motivo_egreso_id = _motivo_traslado,
    destino_egreso = 'Cama ' || _cama_destino_num || ' (traslado interno)',
    egresado_por = _capturado_por
  WHERE id = _paciente_id_actual;

  -- 2) Insertar nuevo paciente en cama destino con datos copiados.
  --    El trigger trg_autollenar_ingreso suma +1 a C02 (ingresos) en
  --    el servicio destino. El trigger tr_crear_hojas_paciente crea
  --    automáticamente las filas en dietas_paciente, formato_control.
  INSERT INTO pacientes (
    id, cama_id,
    nombre_paciente, edad, genero, nss_curp,
    diagnostico_ingreso, especialidad_id,
    fecha_ingreso, hora_ingreso,
    observaciones,
    grupo_sanguineo, alergias,
    estado, capturado_por
  ) VALUES (
    _nuevo_id, _cama_destino_id,
    _paciente.nombre_paciente, _paciente.edad, _paciente.genero, _paciente.nss_curp,
    _paciente.diagnostico_ingreso, _paciente.especialidad_id,
    CURRENT_DATE, LOCALTIME(0)::time,
    'Trasladado desde cama ' || _cama_origen_num || ' (continúa estancia)',
    _paciente.grupo_sanguineo, _paciente.alergias,
    'ACTIVO', _capturado_por
  );

  -- 3) Copiar riesgos UPP/caídas del formato_control viejo al nuevo
  --    (el trigger ya creó la fila nueva con NULL en riesgos).
  IF _fc.riesgo_upp IS NOT NULL OR _fc.riesgo_caidas IS NOT NULL THEN
    UPDATE formato_control_paciente
       SET riesgo_upp = _fc.riesgo_upp,
           riesgo_caidas = _fc.riesgo_caidas
     WHERE paciente_id = _nuevo_id;
  END IF;

  RETURN jsonb_build_object(
    'tipo', 'traslado',
    'paciente_anterior', _paciente_id_actual,
    'paciente_nuevo', _nuevo_id,
    'cama_origen', _paciente.cama_id,
    'cama_destino', _cama_destino_id,
    'cama_origen_num', _cama_origen_num,
    'cama_destino_num', _cama_destino_num,
    'subservicio_origen', _sub_origen,
    'subservicio_destino', _sub_destino
  );
END;
$$;

COMMENT ON FUNCTION public.fn_trasladar_paciente IS
  'Traslada paciente a otra cama. Si es mismo subservicio: solo cambia cama_id. Si es otro subservicio: egresa con motivo TRASLADO (C04 +1) y crea nuevo paciente en cama destino (C02 +1). Copia datos clínicos + riesgos.';

-- Permitir que usuarios autenticados llamen la función (RLS de las
-- tablas internas la ejecuta como SECURITY DEFINER, así que la lógica
-- de permisos vive en validaciones internas: paciente activo, cama
-- libre, etc.).
GRANT EXECUTE ON FUNCTION public.fn_trasladar_paciente(UUID, INTEGER, UUID) TO authenticated;
