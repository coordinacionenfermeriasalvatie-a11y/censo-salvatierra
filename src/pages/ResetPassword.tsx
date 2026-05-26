import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Pantalla a la que llega el usuario despues de hacer click en el enlace
 * del correo de recuperacion de contrasena. Supabase ya valido el token
 * en la URL antes de cargar este componente; solo pedimos la nueva
 * contrasena y la actualizamos con supabase.auth.updateUser().
 */
export function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [hecho, setHecho] = useState(false)
  const [tokenValido, setTokenValido] = useState<boolean | null>(null)

  // Verificar que efectivamente venimos de un magic link de recovery.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setTokenValido(data.session != null)
    })
  }, [])

  async function manejarSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contrasenas no coinciden.')
      return
    }

    setCargando(true)
    const { error } = await supabase.auth.updateUser({ password })
    setCargando(false)

    if (error) {
      setError('No se pudo actualizar la contrasena: ' + error.message)
      return
    }

    setHecho(true)
  }

  if (tokenValido === false) {
    return (
      <div style={styles.contenedor}>
        <main style={styles.main}>
          <div style={styles.tarjeta}>
            <h1 style={styles.titulo}>Enlace invalido o expirado</h1>
            <p style={styles.descripcion}>
              El enlace de recuperacion no es valido o expiro. Vuelve a solicitar uno desde la pantalla de inicio de sesion.
            </p>
            <button onClick={() => navigate('/')} style={styles.boton}>
              Volver al inicio
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (hecho) {
    return (
      <div style={styles.contenedor}>
        <main style={styles.main}>
          <div style={styles.tarjeta}>
            <h1 style={styles.titulo}>✅ Contrasena actualizada</h1>
            <p style={styles.descripcion}>
              Tu nueva contrasena ya esta activa. Puedes empezar a usar el sistema.
            </p>
            <button onClick={() => navigate('/')} style={styles.boton}>
              Ir al inicio
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
          <h1 style={styles.titulo}>Crear nueva contrasena</h1>
          <p style={styles.descripcion}>
            Define una contrasena nueva para tu cuenta. Recomendado: minimo 8 caracteres con letras y numeros.
          </p>

          <form onSubmit={manejarSubmit}>
            <div style={styles.campo}>
              <label style={styles.label}>Nueva contrasena</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={styles.input}
                required
                autoFocus
                minLength={6}
              />
            </div>

            <div style={styles.campo}>
              <label style={styles.label}>Confirmar contrasena</label>
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
              {cargando ? 'Actualizando...' : 'Guardar contrasena'}
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
  }
}
