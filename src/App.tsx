import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { VistaServicio } from './pages/VistaServicio'
import { VistaImpresionControl } from './pages/VistaImpresionControl'
import { VistaImpresionRecetario } from './pages/VistaImpresionRecetario'
import { VistaImpresionDietas } from './pages/VistaImpresionDietas'
import { VistaImpresionProductividad } from './pages/VistaImpresionProductividad'
import { TableroMaestro } from './pages/TableroMaestro'
export function App() {
  const { session, perfil, cargando, cerrarSesion } = useAuth()

  if (cargando) {
    return (
      <div style={pantallaCargando}>
        <p>Cargando sistema...</p>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  if (!perfil) {
    return (
      <div style={pantallaCargando}>
        <p>Tu cuenta aun no tiene perfil asignado.</p>
        <p style={{ fontSize: 12, marginTop: 8 }}>
          Contacta al subjefe de enfermeria para que cree tu perfil con rol y servicio.
        </p>
        <button onClick={cerrarSesion} style={btnSalir}>
          Cerrar sesion
        </button>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Dashboard perfil={perfil} onCerrarSesion={cerrarSesion} />}
        />
        <Route path="/servicio/:servicioId" element={<VistaServicio />} />
        <Route path="/tablero" element={<TableroMaestro />} />
       <Route path="/imprimir/dietas/:servicioId" element={<VistaImpresionDietas />} />
        <Route path="/imprimir/productividad/:anio/:mes" element={<VistaImpresionProductividad />} /> 
        <Route path="/imprimir/recetario/:servicioId" element={<VistaImpresionRecetario />} />
        <Route path="/imprimir/control/:servicioId" element={<VistaImpresionControl />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

const pantallaCargando: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#F5F1E8',
  color: '#265C4E',
  fontSize: 14,
  padding: 24,
  textAlign: 'center'
}

const btnSalir: React.CSSProperties = {
  marginTop: 16,
  padding: '8px 16px',
  background: '#0E6755',
  color: '#C39C59',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'inherit'
}
