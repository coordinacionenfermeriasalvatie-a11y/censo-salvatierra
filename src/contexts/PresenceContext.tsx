// src/contexts/PresenceContext.tsx
// Presencia en tiempo real (Supabase Realtime Presence).
//
// - Cada cliente autenticado se conecta al canal "censo-presence".
// - Mientras esté conectado, transmite su estado (id, nombre, rol, servicio_id,
//   pantalla actual).
// - El estado se sincroniza entre todos los conectados sin polling.
// - Cuando un cliente cierra la pestaña o pierde conexión, su presencia
//   desaparece automáticamente.
//
// Visibilidad: el provider expone TODOS los conectados. El componente que
// los lee decide a quién mostrarlos (en el censo, solo el rol 'jefe' los ve).

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface PresenceState {
  id: string
  nombre: string
  rol: string
  servicio_id: number | null
  pantalla: string          // ruta actual (ej. "/servicio/3")
  desde: string             // ISO timestamp del último update
}

interface MyProfile {
  id: string
  nombre: string
  rol: string
  servicio_id: number | null
}

const CHANNEL = 'censo-presence'

const PresenceContext = createContext<PresenceState[]>([])

export function PresenceProvider({
  children,
  myProfile,
}: {
  children: ReactNode
  myProfile: MyProfile
}) {
  const [users, setUsers] = useState<PresenceState[]>([])
  const location = useLocation()
  const channelRef = useRef<RealtimeChannel | null>(null)

  // 1) Subscribe + track inicial. Solo se re-ejecuta si cambia el usuario.
  useEffect(() => {
    const channel = supabase.channel(CHANNEL, {
      config: { presence: { key: myProfile.id } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>()
        const todos: PresenceState[] = []
        Object.values(state).forEach((arr) => {
          arr.forEach((entry) => todos.push(entry))
        })
        setUsers(todos)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            id: myProfile.id,
            nombre: myProfile.nombre,
            rol: myProfile.rol,
            servicio_id: myProfile.servicio_id,
            pantalla: window.location.pathname,
            desde: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProfile.id])

  // 2) Re-track cuando cambia la pantalla actual (ruta).
  useEffect(() => {
    const ch = channelRef.current
    if (!ch) return
    ch.track({
      id: myProfile.id,
      nombre: myProfile.nombre,
      rol: myProfile.rol,
      servicio_id: myProfile.servicio_id,
      pantalla: location.pathname,
      desde: new Date().toISOString(),
    })
  }, [location.pathname, myProfile.id, myProfile.nombre, myProfile.rol, myProfile.servicio_id])

  return <PresenceContext.Provider value={users}>{children}</PresenceContext.Provider>
}

export function usePresence(): PresenceState[] {
  return useContext(PresenceContext)
}

/**
 * Convierte una ruta interna en una etiqueta amigable.
 * Ej: "/servicio/3" → "Servicio 3"
 *     "/tablero"    → "Tablero Maestro"
 */
export function pantallaLabel(pathname: string): string {
  if (pathname === '/') return 'Dashboard'
  if (pathname === '/tablero') return 'Tablero Maestro'
  if (pathname === '/instructivo') return 'Instructivo'
  if (pathname === '/cambiar-contrasena') return 'Cambiando contraseña'
  if (pathname === '/reset-password') return 'Restableciendo'
  const mServ = pathname.match(/^\/servicio\/(\d+)$/)
  if (mServ) return `Servicio ${mServ[1]}`
  if (pathname.startsWith('/imprimir/')) return 'Vista de impresión'
  return pathname
}
