-- ============================================================
-- TRIGGER: EVENTO REALIZADA -> PRODUCTIVIDAD (Fase A.2)
--
-- Cuando un evento_apoyo_paciente transiciona a estado='Realizada'
-- (INSERT con ese estado, o UPDATE de otro estado a 'Realizada'),
-- intenta incrementar productividad_capturas si el codigo del
-- evento coincide con un indicador del catalogo.
--
-- Si el codigo no existe en catalogo_indicadores_productividad,
-- el trigger no hace nada (degradacion silenciosa).
--
-- Para items de continuidad (sondas, dispositivos, accesos vasculares,
-- precaucion aislamiento) este trigger solo cuenta UNA VEZ al instalar.
-- El conteo por cada turno mientras esten activos lo hace el job
-- programado en el archivo 06.
-- ============================================================

-- Mapeo tipo -> codigo fijo de productividad (para tipos "categoria"
-- donde el codigo del evento es solo detalle UI). Para tipos no listados
-- aqui se usa NEW.codigo directamente.
CREATE OR REPLACE FUNCTION fn_codigo_productividad_por_tipo(_tipo TEXT, _codigo TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Tipos "categoria": cualquier modalidad cuenta como UN indicador agregado
  RETURN CASE _tipo
    WHEN 'oxigeno'         THEN 'OX1'
    WHEN 'higiene'         THEN 'K06'
    WHEN 'glucemia'        THEN 'K07'
    WHEN 'acceso_vascular' THEN 'AV1'
    WHEN 'sonda'           THEN 'SD1'
    WHEN 'dispositivo'     THEN 'DP1'
    WHEN 'curacion'        THEN 'CUR1'
    WHEN 'procedimiento'   THEN 'PRC1'
    -- Tipos "evento": el codigo del evento ya coincide con el del catalogo
    -- (hemoderivado=V29, interconsulta=especialidad, laboratorio=BH/QS,
    --  estudio_gabinete=RXT/ECO, precaucion_aislamiento=K03, etc.)
    ELSE _codigo
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_evento_productividad()
RETURNS TRIGGER AS $$
DECLARE
  _codigo_prod   TEXT;
  _indicador_id  INTEGER;
  _servicio_id   INTEGER;
  _fecha_real    TIMESTAMPTZ;
  _anio          INTEGER;
  _mes           INTEGER;
  _dia           INTEGER;
  _turno         TEXT;
BEGIN
  -- Salimos si no es transicion a Realizada
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = 'Realizada' OR NEW.estado <> 'Realizada' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'Realizada' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Mapear tipo+codigo del evento -> codigo de productividad
  _codigo_prod := fn_codigo_productividad_por_tipo(NEW.tipo, NEW.codigo);

  -- Buscar indicador por codigo (si no existe, salir silenciosamente)
  SELECT id INTO _indicador_id
  FROM catalogo_indicadores_productividad
  WHERE codigo = _codigo_prod
  LIMIT 1;

  IF _indicador_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener servicio del paciente (via cama -> subservicio -> servicio)
  SELECT s.id INTO _servicio_id
  FROM pacientes p
  JOIN camas c ON c.id = p.cama_id
  JOIN subservicios sub ON sub.id = c.subservicio_id
  JOIN servicios s ON s.id = sub.servicio_id
  WHERE p.id = NEW.paciente_id;

  IF _servicio_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calcular anio/mes/dia/turno desde fecha_realizacion (zona local Mazatlan)
  _fecha_real := COALESCE(NEW.fecha_realizacion, NOW()) AT TIME ZONE 'America/Mazatlan';
  _anio  := EXTRACT(YEAR  FROM _fecha_real)::INTEGER;
  _mes   := EXTRACT(MONTH FROM _fecha_real)::INTEGER;
  _dia   := EXTRACT(DAY   FROM _fecha_real)::INTEGER;
  _turno := fn_turno_actual();  -- M / V / N segun la hora actual

  -- Upsert: si ya existe la celda (servicio,indicador,fecha,turno), +1
  INSERT INTO productividad_capturas
    (servicio_id, indicador_id, anio, mes, dia, turno, valor, origen)
  VALUES
    (_servicio_id, _indicador_id, _anio, _mes, _dia, _turno, 1, 'AUTO_EVENTO')
  ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
  DO UPDATE SET valor = productividad_capturas.valor + 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_evento_productividad ON evento_apoyo_paciente;
CREATE TRIGGER trg_evento_productividad
AFTER INSERT OR UPDATE OF estado ON evento_apoyo_paciente
FOR EACH ROW EXECUTE FUNCTION fn_evento_productividad();

COMMENT ON FUNCTION fn_evento_productividad IS
  'Incrementa productividad_capturas cuando un evento_apoyo_paciente pasa a Realizada y su codigo coincide con un indicador del catalogo. Degradacion silenciosa si no hay match.';
