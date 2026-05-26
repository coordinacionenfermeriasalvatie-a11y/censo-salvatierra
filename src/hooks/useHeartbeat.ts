import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Llama fn_heartbeat() cada 30 segundos para que perfiles.ultimo_acceso
 * quede actualizado. El servidor entonces sabe qué usuarios están online.
 *
 * Llama una vez al montar y luego cada 30s. Si el usuario tiene la pestaña
 * en background el navegador puede pausar el setInterval, lo cual es OK:
 * cuando vuelve a la pestaña, la siguiente ejecución actualiza el timestamp.
 */
export function useHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const ping = () => {
      // RPC builder es thenable; lo envolvemos en async para usar try/catch
      ;(async () => {
        try {
          await supabase.rpc('fn_heartbeat')
        } catch {
          // Silencioso — si falla, no rompe la app
        }
      })()
    }

    ping() // primer ping inmediato al montar
    const id = setInterval(ping, 30_000) // cada 30s

    return () => clearInterval(id)
  }, [enabled])
}
