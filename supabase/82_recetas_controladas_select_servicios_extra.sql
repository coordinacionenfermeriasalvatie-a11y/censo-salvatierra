-- ============================================================
-- Migracion 82: SELECT de recetas_controladas para gestor MULTI-SERVICIO
-- ------------------------------------------------------------
-- Contexto: el panel "Recetas controladas realizadas" del recetario
-- muestra al gestor/jefe de servicio las recetas que ya creo. Pero la
-- policy de SELECT (mig 47) solo comparaba el servicio PRINCIPAL del
-- gestor (perfiles.servicio_id). Un gestor multi-servicio (mig 64,
-- servicios_extra) NO podia ver las recetas de sus servicios SECUNDARIOS
-- (caso Carlos Reyes: Hospitalizacion Hombres 1 + Hombres 2 con una sola
-- cuenta) -> el panel salia vacio ahi y hasta podia crear una receta sin
-- poder volver a verla.
--
-- Fix minimo: en la policy de SELECT, ampliar el match del gestor para
-- incluir servicios_extra (igual que fn_user_can_write_servicio de la
-- mig 64). Se conserva el filtro rol='gestor' para NO exponer recetas de
-- medicamentos controlados a enfermeria. Admin global (jefe/subjefe/
-- supervisor) sigue viendo todo via fn_es_admin_global().
--
-- Solo cambia la policy de lectura; no toca datos ni columnas.
-- ASCII puro, lineas cortas. Idempotente. Correr en el SQL Editor.
-- ============================================================
BEGIN;

DROP POLICY IF EXISTS p_recetas_controladas_select ON recetas_controladas;
CREATE POLICY p_recetas_controladas_select
  ON recetas_controladas FOR SELECT
  TO authenticated
  USING (
    fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid()
        AND rol = 'gestor'
        AND (
          servicio_id = recetas_controladas.servicio_id
          OR recetas_controladas.servicio_id = ANY(servicios_extra)
        )
    )
  );

-- POST-CHECK: la policy de SELECT debe existir con la nueva condicion.
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'recetas_controladas'
  AND policyname = 'p_recetas_controladas_select';

COMMIT;
