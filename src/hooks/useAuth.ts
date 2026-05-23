import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types'
import type { Session } from '@supabase/supabase-js'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        cargarPerfil(data.session.user.id)
      } else {
        setCargando(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        cargarPerfil(newSession.user.id)
      } else {
        setPerfil(null)
        setCargando(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function cargarPerfil(userId: string) {
    setCargando(true)
    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!error && data) {
      setPerfil(data as Perfil)
    }
    setCargando(false)
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
  }

  return { session, perfil, cargando, cerrarSesion }
}
