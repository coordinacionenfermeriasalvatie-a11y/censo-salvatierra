-- ============================================================
-- Migracion 84: anular receta controlada tambien para admin del sistema
-- ------------------------------------------------------------
-- Contexto: el panel "Recetas controladas realizadas" del recetario ahora
-- deja a JEFE y ADMINISTRADOR DEL SISTEMA corregir (editar) o "borrar"
-- una receta. En un libro de controlados el DELETE esta bloqueado a
-- proposito (mig 47), asi que "borrar" = ANULAR via
-- fn_anular_receta_controlada (mig 60), que conserva el registro con
-- motivo y revierte el stock si ya estaba canjeada.
--
-- La fn original (mig 60) autoriza a rol IN (jefe, subjefe, supervisor).
-- El gate del frontend es esJefeOAdmin = rol='jefe' OR es_admin_sistema.
-- Para que coincidan exactamente, se amplia la autorizacion del RPC para
-- incluir tambien a perfiles con es_admin_sistema = true (sin quitar a los
-- supervisores que ya la usan desde la Bitacora de Supervision).
--
-- Solo cambia el cuerpo de la funcion (CREATE OR REPLACE). Idempotente.
-- ASCII puro, lineas cortas. Correr en el SQL Editor.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION fn_anular_receta_controlada(p_id UUID, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _rc      recetas_controladas%ROWTYPE;
  _perfil  perfiles%ROWTYPE;
BEGIN
  SELECT * INTO _perfil FROM perfiles WHERE id = auth.uid();
  IF _perfil.id IS NULL OR NOT _perfil.activo
     OR (_perfil.rol NOT IN ('jefe','subjefe','supervisor')
         AND _perfil.es_admin_sistema IS NOT TRUE) THEN
    RAISE EXCEPTION 'No autorizado para anular vales';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Debe indicar el motivo de la anulacion';
  END IF;

  SELECT * INTO _rc FROM recetas_controladas WHERE id = p_id;
  IF _rc.id IS NULL THEN
    RAISE EXCEPTION 'Vale no encontrado';
  END IF;
  IF _rc.cancelada_en IS NOT NULL THEN
    RETURN;  -- ya estaba anulada, idempotente
  END IF;

  -- Si ya se habia canjeado, revertir la salida de stock generada por el canje.
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

-- POST-CHECK: la funcion debe existir.
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'fn_anular_receta_controlada';

COMMIT;
