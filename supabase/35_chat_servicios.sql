-- ============================================================
-- Migración 35: Chat entre servicios y con la jefatura
-- ============================================================
-- 2 canales por servicio:
--   - 'servicio:N'  → chat interno del servicio N (los gestores
--                     del servicio + admins globales lo leen y escriben)
--   - 'global'      → chat común entre todos los servicios y la
--                     jefatura. Todos los autenticados leen y escriben.
--
-- Mensajes inmutables (no se editan). Solo el autor o un admin
-- global pueden eliminar su mensaje.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_mensajes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal       TEXT NOT NULL CHECK (canal = 'global' OR canal ~ '^servicio:[0-9]+$'),
  remitente   UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  contenido   TEXT NOT NULL CHECK (length(trim(contenido)) > 0 AND length(contenido) <= 2000),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  eliminado   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_chat_canal_fecha
  ON public.chat_mensajes (canal, creado_en DESC)
  WHERE NOT eliminado;
CREATE INDEX IF NOT EXISTS idx_chat_remitente
  ON public.chat_mensajes (remitente);

-- Helper: extrae el servicio_id de un canal 'servicio:N' o devuelve NULL
CREATE OR REPLACE FUNCTION public.fn_chat_servicio_id(_canal TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _canal LIKE 'servicio:%' THEN substring(_canal FROM 10)::int
    ELSE NULL
  END;
$$;

-- Habilitar Realtime para que los clientes reciban mensajes en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensajes;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.chat_mensajes ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier autenticado puede leer el canal global; los de un
-- servicio pueden leer su propio canal; los admins leen todo.
DROP POLICY IF EXISTS p_chat_select ON public.chat_mensajes;
CREATE POLICY p_chat_select ON public.chat_mensajes
  FOR SELECT TO authenticated
  USING (
    canal = 'global'
    OR fn_es_admin_global()
    OR EXISTS (
      SELECT 1 FROM perfiles p
      WHERE p.id = auth.uid()
        AND p.servicio_id = fn_chat_servicio_id(chat_mensajes.canal)
    )
  );

-- INSERT: el remitente debe ser el usuario autenticado. Para canal de
-- servicio, debe ser del servicio o admin global.
DROP POLICY IF EXISTS p_chat_insert ON public.chat_mensajes;
CREATE POLICY p_chat_insert ON public.chat_mensajes
  FOR INSERT TO authenticated
  WITH CHECK (
    remitente = auth.uid()
    AND (
      canal = 'global'
      OR fn_es_admin_global()
      OR EXISTS (
        SELECT 1 FROM perfiles p
        WHERE p.id = auth.uid()
          AND p.servicio_id = fn_chat_servicio_id(chat_mensajes.canal)
      )
    )
  );

-- UPDATE: solo el autor puede marcar como eliminado (soft delete)
DROP POLICY IF EXISTS p_chat_update ON public.chat_mensajes;
CREATE POLICY p_chat_update ON public.chat_mensajes
  FOR UPDATE TO authenticated
  USING (remitente = auth.uid() OR fn_es_admin_global())
  WITH CHECK (remitente = auth.uid() OR fn_es_admin_global());

COMMENT ON TABLE public.chat_mensajes IS
  'Mensajes de chat entre servicios y jefatura. 2 tipos de canal: global (todos) y servicio:N (gestores del servicio + admins).';

-- POST-CHECK
SELECT 'OK' AS status,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename='chat_mensajes') AS policies_creadas;
