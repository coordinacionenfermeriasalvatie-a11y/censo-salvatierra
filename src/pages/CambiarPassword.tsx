import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

/**
 * Pantalla para cambiar contrasena desde dentro del sistema.
 * El usuario debe estar logueado y conocer su contrasena actual.
 */
export function CambiarPassword() {
  const navigate = useNavigate()
  const { session, perfil } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [hecho, setHecho] = useState(false)

  async function manejarSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (nueva.length < 6) {
      setError('La nueva contrasena debe tener al menos 6 caracteres.')
      return
    }
    if (nueva !== confirm) {
      setError('La confirmacion no coincide.')
      return
    }
    if (nueva === actual) {
      setError('La nueva contrasena debe ser distinta a la actual.')
      return
    }

    setCargando(true)

    // 1) Verificar contrasena actual reautenticando
    const email = session?.user?.email
    if (!email) {
      setError('No se pudo identificar tu correo. Cierra sesion y vuelve a entrar.')
      setCargando(false)
      return
    }
    const { error: errAuth } = await supabase.auth.signInWithPassword({
      email,
      password: actual
    })
    if (errAuth) {
      setError('La contrasena actual es incorrecta.')
      setCargando(false)
      return
    }

    // 2) Actualizar a la nueva
    const { error: errUpd } = await supabase.auth.updateUser({ password: nueva })
    setCargando(false)

    if (errUpd) {
      setError('No se pudo actualizar la contrasena: ' + errUpd.message)
      return
    }

    setHecho(true)
  }

  if (hecho) {
    return (
      <div style={styles.contenedor}>
        <main style={styles.main}>
          <div style={styles.tarjeta}>
            <h1 style={styles.titulo}>✅ Contrasena cambiada</h1>
            <p style={styles.descripcion}>
              Tu contrasena se actualizo correctamente. La proxima vez que inicies sesion usa la nueva.
            </p>
            <button onClick={() => navigate('/')} style={styles.boton}>
              Volver al tablero
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={styles.contenedor}>
      <header style={styles.header}>
        <img src="/logos/imss_bienestar.png" alt="IMSS Bienestar" style={styles.logo} />
        <img src="/logos/LOGO_HOSPITAL.jpg" alt="Hospital Salvatierra" style={styles.logo} />
      </header>

      <main style={styles.main}>
        <div style={styles.tarjeta}>
          <h1 style={styles.titulo}>Cambiar contrasena</h1>
          {perfil && (
            <p style={styles.subtitulo}>
              {perfil.nombre_completo}
            </p>
          )}

          <form onSubmit={manejarSubmit}>
            <div style={styles.campo}>
              <label style={styles.label}>Contrasena actual</label>
              <input
                type="password"
                value={actual}
                onChange={e => setActual(e.target.value)}
                style={styles.input}
                required
                autoFocus
              />
            </div>

            <div style={styles.campo}>
              <label style={styles.label}>Nueva contrasena</label>
              <input
                type="password"
                value={nueva}
                onChange={e => setNueva(e.target.value)}
                style={styles.input}
                required
                minLength={6}
              />
            </div>

            <div style={styles.campo}>
              <label style={styles.label}>Confirmar nueva contrasena</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                style={styles.input}
                required
                minLength={6}
              />
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button type="submit" disabled={cargando} style={styles.boton}>
              {cargando ? 'Guardando...' : 'Guardar nueva contrasena'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              style={styles.linkBoton}
            >
              Cancelar
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

const COLOR_VERDE_IMSS = '#0E6755'
const COLOR_DORADO = '#C39C59'
const COLOR_FONDO = '#F5F1E8'
const COLOR_VERDE_OSCURO = '#265C4E'

const styles: Record<string, React.CSSProperties> = {
  contenedor: {
    minHeight: '100vh',
    background: COLOR_FONDO,
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    background: '#FFFFFF',
    borderBottom: `3px solid ${COLOR_DORADO}`,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16
  },
  logo: { height: 56, width: 'auto', maxWidth: '45%', objectFit: 'contain' },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  tarjeta: {
    background: '#FFFFFF',
    border: `1px solid ${COLOR_DORADO}`,
    borderRadius: 8,
    padding: 32,
    width: '100%',
    maxWidth: 420
  },
  titulo: { margin: 0, fontSize: 20, color: COLOR_VERDE_IMSS, fontWeight: 500, textAlign: 'center' },
  subtitulo: { margin: '4px 0 20px', fontSize: 13, color: COLOR_VERDE_OSCURO, textAlign: 'center' },
  descripcion: {
    margin: '8px 0 20px',
    fontSize: 13,
    color: COLOR_VERDE_OSCURO,
    textAlign: 'center',
    lineHeight: 1.4
  },
  campo: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: COLOR_VERDE_OSCURO, fontWeight: 500, marginBottom: 4 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    border: `1px solid ${COLOR_DORADO}`,
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'inherit'
  },
  error: {
    margin: '0 0 12px',
    padding: '8px 12px',
    background: '#FCEBEB',
    color: '#A32D2D',
    borderRadius: 4,
    fontSize: 13
  },
  boton: {
    width: '100%',
    padding: '12px',
    background: COLOR_VERDE_IMSS,
    color: COLOR_DORADO,
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer'
  },
  linkBoton: {
    width: '100%',
    marginTop: 10,
    padding: '8px',
    background: 'transparent',
    color: COLOR_VERDE_IMSS,
    border: 'none',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit'
  }
}
