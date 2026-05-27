-- ============================================================
-- Migración 34: Aislamiento capturado al ingreso (universal)
-- ============================================================
-- Hasta ahora el tipo de aislamiento se capturaba solo desde la
-- pestaña Control (como evento_apoyo_paciente tipo=precaucion_aislamiento).
-- Ahora también se puede seleccionar al ingresar al paciente, y se
-- propaga automáticamente:
--   - Control: aparece como evento ACTIVO con estado=Realizada
--   - Productividad: suma +1 a K03 al insertar (vía trigger
--     fn_evento_productividad)
--   - Dietas: la vista v_aislamiento_activo lo expone para mostrar chip
--
-- Cambios:
--   1) Mapper agrega precaucion_aislamiento → K03 explícito
--   2) K03 cambia a origen AUTO_EVENTO
--   3) Vista v_aislamiento_activo (paciente_id, codigo, etiqueta)
-- ============================================================

-- 1) Reemplazar el mapper con el caso explícito de aislamiento
CREATE OR REPLACE FUNCTION public.fn_codigos_prod_por_evento_paciente(
  _paciente_id UUID,
  _tipo TEXT,
  _codigo TEXT
)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _es_neonato BOOLEAN := FALSE;
BEGIN
  IF _tipo IN ('curacion', 'acceso_vascular') THEN
    SELECT (p.edad = 0 OR sub.nombre ILIKE '%UCIN%' OR sub.nombre ILIKE '%NEONA%')
      INTO _es_neonato
    FROM pacientes p
    JOIN camas c          ON c.id = p.cama_id
    JOIN subservicios sub ON sub.id = c.subservicio_id
    WHERE p.id = _paciente_id;
  END IF;

  RETURN CASE _tipo
    WHEN 'acceso_vascular' THEN
      CASE _codigo
        WHEN 'CVP'       THEN CASE WHEN _es_neonato THEN ARRAY['AV1','V05'] ELSE ARRAY['AV1','V09'] END
        WHEN 'CVC'       THEN ARRAY['AV1','V01']
        WHEN 'UMBILICAL' THEN ARRAY['AV1','V25']
        WHEN 'LM'        THEN ARRAY['AV1','V13']
        ELSE ARRAY['AV1']
      END

    WHEN 'curacion' THEN
      CASE _codigo
        WHEN 'CUR_CVP' THEN CASE WHEN _es_neonato THEN ARRAY['V08','CUR1'] ELSE ARRAY['V12','CUR1'] END
        WHEN 'REF_CVP' THEN CASE WHEN _es_neonato THEN ARRAY['V07','CUR1'] ELSE ARRAY['V11','CUR1'] END
        WHEN 'CUR_CVC' THEN ARRAY['V03','CUR1']
        WHEN 'REF_CVC' THEN ARRAY['V04','CUR1']
        WHEN 'CUR_LM'  THEN ARRAY['V15','CUR1']
        WHEN 'REF_LM'  THEN ARRAY['V16','CUR1']
        ELSE ARRAY['CUR1']
      END

    WHEN 'procedimiento' THEN
      CASE
        WHEN _codigo IS NULL OR _codigo = '' THEN ARRAY['PRC1']
        ELSE ARRAY['PRC1', _codigo]
      END

    WHEN 'sonda'        THEN ARRAY['SD1']
    WHEN 'dispositivo'  THEN ARRAY['DP1']
    WHEN 'oxigeno'      THEN ARRAY['OX1']
    WHEN 'higiene'      THEN ARRAY['K06']
    WHEN 'glucemia'     THEN ARRAY['K07']
    -- NUEVO: cualquier tipo de aislamiento suma a K03 (Pacientes con aislamiento).
    -- Códigos esperados: ESTANDAR, POR_GOTA, POR_VIA_AEREA, CONTACTO, PROTECTOR, CONTACTO_PLUS.
    WHEN 'precaucion_aislamiento' THEN ARRAY['K03']
    ELSE ARRAY[_codigo]
  END;
END;
$$;

-- 2) K03 cambia de AUTO_ING a AUTO_EVENTO (se llena por evento, no por ingreso)
UPDATE catalogo_indicadores_productividad
   SET origen = 'AUTO_EVENTO'
 WHERE codigo = 'K03';

-- 3) Vista para consumir aislamiento activo desde dietas/censo
CREATE OR REPLACE VIEW public.v_aislamiento_activo AS
SELECT DISTINCT ON (e.paciente_id)
  e.paciente_id,
  e.codigo,
  CASE e.codigo
    WHEN 'ESTANDAR'      THEN '🔴 Estándar'
    WHEN 'POR_GOTA'      THEN '🟢 Por gota'
    WHEN 'POR_VIA_AEREA' THEN '🔵 Por vía aérea'
    WHEN 'CONTACTO'      THEN '🟡 Por contacto'
    WHEN 'PROTECTOR'     THEN '⬜ Protector'
    WHEN 'CONTACTO_PLUS' THEN '🟫 Contacto plus'
    ELSE e.codigo
  END AS etiqueta,
  e.fecha_realizacion
FROM evento_apoyo_paciente e
WHERE e.tipo = 'precaucion_aislamiento'
  AND e.estado = 'Realizada'
ORDER BY e.paciente_id, e.fecha_realizacion DESC;

COMMENT ON VIEW public.v_aislamiento_activo IS
  'Tipo de aislamiento activo por paciente. Usado en VistaDietas para mostrar chip y en cualquier vista que necesite saber si un paciente tiene precauciones.';

GRANT SELECT ON public.v_aislamiento_activo TO authenticated;
