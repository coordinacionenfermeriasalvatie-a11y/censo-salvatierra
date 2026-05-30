-- ============================================================
-- AGREGAR DIAZEPAM A CONTROLADOS (tableta + inyectable) -> Grupo III
-- ------------------------------------------------------------
-- Ambas presentaciones de Diazepam quedaron SIN clasificar tras el cambio
-- de catalogo. Benzodiacepina => Grupo III (igual que midazolam, lorazepam,
-- clonazepam y alprazolam en este app).
-- Idempotente: solo toca filas sin clasificar; el ILIKE cubre las 2 formas.
-- Correr en el SQL Editor de Supabase (proyecto xdvvmtqjksebqoflvbhj).
-- ============================================================
BEGIN;

UPDATE catalogo_medicamentos SET grupo_control = 'III'
WHERE grupo_control IS NULL AND nombre ILIKE '%diazepam%';

-- Verificacion: las 2 presentaciones deben salir con grupo_control = 'III'
SELECT nombre, grupo_control, activo
FROM catalogo_medicamentos
WHERE nombre ILIKE '%diazepam%'
ORDER BY nombre;

COMMIT;
