-- ============================================================
-- Migración 62: Camas no censables — HOSP-1 + reposets ONC + cunas PED
-- ============================================================
-- Dictado del subjefe:
--   1) HOSP-1 (Clínica de Heridas / CDH) NO censable → reafirma mig 57
--      (por si no quedó aplicada en producción).
--   2) ONCOLOGÍA PEDIÁTRICA: +5 reposets para quimioterapias ambulatorias,
--      NO censables. Deben aparecer SOLO en Censo, Control y Productividad
--      (NO en Dietas ni Recetario). Se etiquetan tipo_cama='REPOSET' para
--      poder excluirlos de esas dos hojas (ver NOTA al final).
--   3) PEDIATRÍA: +4 cunas NO censables en cada uno de UCIN, UTIN y CYD.
--      Se etiquetan tipo_cama='CUNA'.
--
-- Numeración ("el número subsecuente de las censables"): cada cama nueva
-- toma el siguiente entero después de la MAYOR cama CENSABLE de su
-- subservicio. El máximo se calcula SOLO sobre censables, por eso el script
-- es idempotente (las nuevas no censables nunca elevan ese máximo):
--   UCIN (censables 1-6)   → 7, 8, 9, 10
--   UTIN (censables 1-4)   → 5, 6, 7, 8
--   CYD  (censables 1-6)   → 7, 8, 9, 10
--   ONC  (censables 41-53) → 54, 55, 56, 57, 58
--
-- Idempotente: ON CONFLICT DO NOTHING + máximo solo sobre censables.
-- ============================================================

-- 0) Columna para distinguir camas especiales (reposet/cuna) de las camas
--    normales y de otras no censables (camillas). Nullable, no rompe nada.
ALTER TABLE public.camas ADD COLUMN IF NOT EXISTS tipo_cama TEXT;

-- 1) HOSP-1 (CDH) no censable — reafirma migración 57.
UPDATE camas
   SET es_censable = FALSE
 WHERE numero_cama = 'HOSP-1'
   AND subservicio_id IN (
     SELECT sub.id FROM subservicios sub
     JOIN servicios s ON s.id = sub.servicio_id
     WHERE s.codigo = 'CDH'
   );
UPDATE servicios SET total_camas = 0 WHERE codigo = 'CDH';

-- 2) Alta de camas no censables, numeradas tras la última censable de cada
--    subservicio. Recorre la lista de destinos y omite con aviso cualquier
--    subservicio que no exista (defensivo).
--
--    OJO con los códigos de servicio: en producción se acortaron a 'PED' y
--    'ONC' (NO '06_PEDIATRIA' / '10_ONCOLOGIA_PED' del schema original).
--    El subservicio se matchea con ILIKE sobre nombre TRIM-eado:
--      - 'ONCOLOG%' = prefijo SIN acentos → casa con 'ONCOLOGIA PEDIATRICA'
--        o 'ONCOLOGÍA PEDIÁTRICA' (producción pudo guardarlo acentuado).
--      - 'UCIN'/'UTIN'/'CYD' = exactos (confirmados en el censo PED).
DO $$
DECLARE
  r       RECORD;
  _sub_id INT;
  _maxnum INT;
BEGIN
  FOR r IN (
    SELECT * FROM (VALUES
      ('ONC', 'ONCOLOG%', 5, 'REPOSET'),
      ('PED', 'UCIN',     4, 'CUNA'),
      ('PED', 'UTIN',     4, 'CUNA'),
      ('PED', 'CYD',      4, 'CUNA')
    ) AS t(codigo, subpat, n, tipo)
  ) LOOP
    SELECT sub.id INTO _sub_id
    FROM subservicios sub
    JOIN servicios s ON s.id = sub.servicio_id
    WHERE s.codigo = r.codigo AND TRIM(sub.nombre) ILIKE r.subpat
    LIMIT 1;

    IF _sub_id IS NULL THEN
      RAISE NOTICE 'Subservicio % / % no encontrado; se omite.', r.codigo, r.subpat;
      CONTINUE;
    END IF;

    -- Máximo SOLO sobre camas censables numéricas → base estable e idempotente.
    SELECT COALESCE(
             MAX(numero_cama::int) FILTER (
               WHERE numero_cama ~ '^[0-9]+$' AND es_censable = TRUE
             ), 0)
      INTO _maxnum
    FROM camas
    WHERE subservicio_id = _sub_id;

    INSERT INTO camas (subservicio_id, numero_cama, activa, es_censable, tipo_cama)
    SELECT _sub_id, (_maxnum + gs)::text, TRUE, FALSE, r.tipo
    FROM generate_series(1, r.n) gs
    ON CONFLICT (subservicio_id, numero_cama) DO NOTHING;
  END LOOP;
END $$;

-- 3) POST-CHECK: HOSP-1 + todas las nuevas no censables, ordenadas.
SELECT s.codigo,
       sub.nombre AS subservicio,
       c.numero_cama,
       c.es_censable,
       c.tipo_cama
FROM camas c
JOIN subservicios sub ON sub.id = c.subservicio_id
JOIN servicios s      ON s.id  = sub.servicio_id
WHERE (s.codigo = 'CDH' AND c.numero_cama = 'HOSP-1')
   OR c.tipo_cama IN ('REPOSET', 'CUNA')
ORDER BY s.orden, sub.orden,
         CASE WHEN c.numero_cama ~ '^[0-9]+$' THEN c.numero_cama::int ELSE 9999 END,
         c.numero_cama;
