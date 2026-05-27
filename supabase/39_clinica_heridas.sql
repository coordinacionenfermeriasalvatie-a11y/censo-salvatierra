-- ============================================================
-- Migración 39: Servicio CLÍNICA DE HERIDAS + bitácora propia
-- ============================================================
-- 1) Crea servicio CDH (Clínica de Heridas), orden 14.
-- 2) Mueve las 2 camas de URG CURACIONES a CDH como ambulatorias
--    (no censables) y agrega 1 cama hospitalaria (censable).
-- 3) Tabla bitacora_heridas con los campos del formato impreso
--    institucional v2.1.
-- 4) Trigger que suma a productividad:
--      - H01 (Clínica Heridas Ambulatorio) +1 por cada registro de
--        ambulatorio.
--      - H02 (Clínica Heridas Hospitalización) +1 por cada registro
--        marcado como hospitalario.
--      - H04 (Pacientes atendidos por Sutura) += suturas si > 0.
-- 5) Marca H01, H02, H04 como AUTO_EVENTO en el catálogo.
-- ============================================================

-- 1) Servicio CDH (total_camas = 1 porque solo 1 cama es censable; las
--    2 ambulatorias no cuentan en el indicador de ocupación)
INSERT INTO servicios (codigo, nombre, total_camas, orden)
VALUES ('CDH', 'CLÍNICA DE HERIDAS', 1, 14)
ON CONFLICT (codigo) DO UPDATE
SET nombre=EXCLUDED.nombre, total_camas=EXCLUDED.total_camas, orden=EXCLUDED.orden;

-- 1.b) Ajustar URG: pierde 2 camas censables (CURACIONES 1 y 2)
UPDATE servicios SET total_camas = GREATEST(total_camas - 2, 0)
 WHERE codigo='URG'
   AND EXISTS (
     SELECT 1 FROM camas c
     WHERE c.subservicio_id = 3 AND c.numero_cama IN ('1','2') AND c.es_censable = TRUE
   );

-- 2) Subservicio único "CLÍNICA DE HERIDAS"
INSERT INTO subservicios (servicio_id, nombre, orden)
SELECT id, 'CLÍNICA DE HERIDAS', 1 FROM servicios WHERE codigo='CDH'
ON CONFLICT DO NOTHING;

-- 3) Mover las 2 camas existentes de URG CURACIONES (subservicio_id=3)
--    al nuevo subservicio y marcarlas como ambulatorias (es_censable=FALSE)
UPDATE camas
   SET subservicio_id = (SELECT sub.id FROM subservicios sub JOIN servicios s ON s.id=sub.servicio_id WHERE s.codigo='CDH'),
       es_censable = FALSE,
       numero_cama = CASE numero_cama WHEN '1' THEN 'AMB-1' WHEN '2' THEN 'AMB-2' ELSE numero_cama END
 WHERE subservicio_id = 3
   AND numero_cama IN ('1','2');

-- 4) Crear la cama hospitalaria (censable) si no existe
INSERT INTO camas (subservicio_id, numero_cama, activa, es_censable)
SELECT sub.id, 'HOSP-1', TRUE, TRUE
FROM subservicios sub
JOIN servicios s ON s.id = sub.servicio_id
WHERE s.codigo='CDH'
  AND NOT EXISTS (
    SELECT 1 FROM camas c
    WHERE c.subservicio_id = sub.id AND c.numero_cama = 'HOSP-1'
  );

-- 5) Tabla bitacora_heridas: una fila por atención
CREATE TABLE IF NOT EXISTS public.bitacora_heridas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id       INTEGER NOT NULL REFERENCES servicios(id), -- CDH
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  turno             TEXT NOT NULL CHECK (turno IN ('M','V','N')),
  nombre_paciente   TEXT NOT NULL,
  nss_curp          TEXT,
  tipo_lesion       SMALLINT CHECK (tipo_lesion BETWEEN 1 AND 10), -- 1..10 del catálogo
  pie_diabetico_programado BOOLEAN NOT NULL DEFAULT FALSE,
  pie_diabetico_realizado  BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_no_realizado TEXT,
  inyecciones      SMALLINT NOT NULL DEFAULT 0 CHECK (inyecciones >= 0),
  sondas           SMALLINT NOT NULL DEFAULT 0 CHECK (sondas >= 0),
  yeso_ferula      SMALLINT NOT NULL DEFAULT 0 CHECK (yeso_ferula >= 0),
  suturas          SMALLINT NOT NULL DEFAULT 0 CHECK (suturas >= 0),
  es_hospitalizado BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE=cama hosp, FALSE=ambulatorio
  responsable      TEXT,
  observaciones    TEXT,
  capturado_por    UUID REFERENCES perfiles(id),
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_heridas_fecha ON public.bitacora_heridas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_heridas_paciente ON public.bitacora_heridas(nombre_paciente);

ALTER TABLE public.bitacora_heridas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_bitacora_heridas_select ON public.bitacora_heridas;
CREATE POLICY p_bitacora_heridas_select ON public.bitacora_heridas
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS p_bitacora_heridas_insert ON public.bitacora_heridas;
CREATE POLICY p_bitacora_heridas_insert ON public.bitacora_heridas
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles p JOIN servicios s ON s.id = p.servicio_id
      WHERE p.id = auth.uid() AND s.codigo = 'CDH'
    )
  );

DROP POLICY IF EXISTS p_bitacora_heridas_update ON public.bitacora_heridas;
CREATE POLICY p_bitacora_heridas_update ON public.bitacora_heridas
  FOR UPDATE TO authenticated
  USING (
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles p JOIN servicios s ON s.id = p.servicio_id
      WHERE p.id = auth.uid() AND s.codigo = 'CDH'
    )
  );

-- 6) Trigger: al insertar una atención de heridas, suma productividad
CREATE OR REPLACE FUNCTION public.fn_bitacora_heridas_productividad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ind_h01 INTEGER;
  _ind_h02 INTEGER;
  _ind_h04 INTEGER;
BEGIN
  SELECT id INTO _ind_h01 FROM catalogo_indicadores_productividad WHERE codigo='H01' LIMIT 1;
  SELECT id INTO _ind_h02 FROM catalogo_indicadores_productividad WHERE codigo='H02' LIMIT 1;
  SELECT id INTO _ind_h04 FROM catalogo_indicadores_productividad WHERE codigo='H04' LIMIT 1;

  -- H01 ambulatorio | H02 hospitalizado
  IF NEW.es_hospitalizado AND _ind_h02 IS NOT NULL THEN
    INSERT INTO productividad_capturas (servicio_id, indicador_id, anio, mes, dia, turno, valor, origen)
    VALUES (NEW.servicio_id, _ind_h02,
            EXTRACT(YEAR FROM NEW.fecha)::INT,
            EXTRACT(MONTH FROM NEW.fecha)::INT,
            EXTRACT(DAY FROM NEW.fecha)::INT,
            NEW.turno, 1, 'AUTO_EVENTO')
    ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
    DO UPDATE SET valor = productividad_capturas.valor + 1;
  ELSIF _ind_h01 IS NOT NULL THEN
    INSERT INTO productividad_capturas (servicio_id, indicador_id, anio, mes, dia, turno, valor, origen)
    VALUES (NEW.servicio_id, _ind_h01,
            EXTRACT(YEAR FROM NEW.fecha)::INT,
            EXTRACT(MONTH FROM NEW.fecha)::INT,
            EXTRACT(DAY FROM NEW.fecha)::INT,
            NEW.turno, 1, 'AUTO_EVENTO')
    ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
    DO UPDATE SET valor = productividad_capturas.valor + 1;
  END IF;

  -- H04 += suturas
  IF NEW.suturas > 0 AND _ind_h04 IS NOT NULL THEN
    INSERT INTO productividad_capturas (servicio_id, indicador_id, anio, mes, dia, turno, valor, origen)
    VALUES (NEW.servicio_id, _ind_h04,
            EXTRACT(YEAR FROM NEW.fecha)::INT,
            EXTRACT(MONTH FROM NEW.fecha)::INT,
            EXTRACT(DAY FROM NEW.fecha)::INT,
            NEW.turno, NEW.suturas, 'AUTO_EVENTO')
    ON CONFLICT (servicio_id, indicador_id, anio, mes, dia, turno)
    DO UPDATE SET valor = productividad_capturas.valor + EXCLUDED.valor;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bitacora_heridas_productividad ON public.bitacora_heridas;
CREATE TRIGGER trg_bitacora_heridas_productividad
  AFTER INSERT ON public.bitacora_heridas
  FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora_heridas_productividad();

-- 7) H01, H02, H04 pasan a AUTO_EVENTO
UPDATE catalogo_indicadores_productividad
   SET origen = 'AUTO_EVENTO'
 WHERE codigo IN ('H01','H02','H04');

-- 8) POST-CHECK
SELECT s.codigo, s.nombre, c.numero_cama, c.es_censable
FROM servicios s
JOIN subservicios sub ON sub.servicio_id=s.id
JOIN camas c ON c.subservicio_id=sub.id
WHERE s.codigo='CDH'
ORDER BY c.es_censable, c.numero_cama;
