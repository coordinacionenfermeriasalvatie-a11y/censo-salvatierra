import { useState, FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function manejarLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setError('Credenciales incorrectas. Verifica usuario y contrasena.')
    }
    setCargando(false)
  }

  return (
    <div style={styles.contenedor}>
      <header style={styles.header}>
        <img
          src="/logos/imss_bienestar.png"
          alt="IMSS Bienestar - Secretaria de Salud"
          style={styles.logoIzquierda}
        />
        <img
          src="/logos/LOGO_HOSPITAL.jpg"
          alt="Hospital General con Especialidades Juan Maria de Salvatierra"
          style={styles.logoDerecha}
        />
      </header>

      <main style={styles.main}>
        <div style={styles.tarjeta}>
          <h1 style={styles.titulo}>Sistema de censo hospitalario</h1>
          <p style={styles.subtitulo}>Coordinacion de Enfermeria</p>

          <form onSubmit={manejarLogin}>
            <div style={styles.campo}>
              <label style={styles.label}>Correo institucional</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@imssbienestar.gob.mx"
                style={styles.input}
                required
                autoFocus
              />
            </div>

            <div style={styles.campo}>
              <label style={styles.label}>Contrasena</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={styles.input}
                required
              />
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button type="submit" disabled={cargando} style={styles.boton}>
              {cargando ? 'Iniciando sesion...' : 'Iniciar sesion'}
            </button>
          </form>

          <p style={styles.ayuda}>
            Olvidaste tu contrasena? Contacta al subjefe de enfermeria.
          </p>
        </div>

        <footer style={styles.footer}>
          La Paz, Baja California Sur - IMSS-Bienestar
        </footer>
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
    gap: 16,
    flexWrap: 'wrap'
  },
  logoIzquierda: {
    height: 56,
    width: 'auto',
    maxWidth: '45%',
    objectFit: 'contain'
  },
  logoDerecha: {
    height: 56,
    width: 'auto',
    maxWidth: '45%',
    objectFit: 'contain'
  },
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
  titulo: {
    margin: 0,
    fontSize: 20,
    color: COLOR_VERDE_IMSS,
    fontWeight: 500,
    textAlign: 'center'
  },
  subtitulo: {
    margin: '4px 0 24px',
    fontSize: 13,
    color: COLOR_VERDE_OSCURO,
    textAlign: 'center'
  },
  campo: {
    marginBottom: 14
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: COLOR_VERDE_OSCURO,
    fontWeight: 500,
    marginBottom: 4
  },
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
  ayuda: {
    margin: '16px 0 0',
    fontSize: 11,
    color: COLOR_VERDE_OSCURO,
    textAlign: 'center'
  },
  footer: {
    marginTop: 24,
    fontSize: 11,
    color: COLOR_VERDE_OSCURO,
    textAlign: 'center'
  }
}
