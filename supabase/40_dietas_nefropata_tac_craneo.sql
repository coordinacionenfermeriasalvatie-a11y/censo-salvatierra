-- ============================================================
-- Migración 40: catálogos
--   - Dieta para nefrópata
--   - Dieta sin colecistoquinéticos
--   - TAC CRÁNEO (estudio de gabinete)
-- ============================================================

INSERT INTO catalogo_tipos_dieta (nombre, orden)
VALUES ('PARA NEFROPATA', 12), ('SIN COLECISTOQUINETICOS', 13)
ON CONFLICT (nombre) DO UPDATE
SET orden = EXCLUDED.orden, activo = TRUE;

INSERT INTO catalogo_estudios_gabinete (codigo, nombre, orden)
VALUES ('TAC_CRANEO', 'TAC CRÁNEO', 45)
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, activo = TRUE;
