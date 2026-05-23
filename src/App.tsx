import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { useAuth } from './hooks/useAuth'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'

// Code-splitting: estas paginas pesadas se cargan solo cuando se visitan.
// Reduce el bundle inicial de ~424KB gzip a ~150KB gzip aproximadamente.
const VistaServicio              = lazy(() => import('./pages/VistaServicio').then(m => ({ default: m.VistaServicio })))
const VistaImpresionControl      = lazy(() => import('./pages/VistaImpresionControl').then(m => ({ default: m.VistaImpresionControl })))
const VistaImpresionRecetario    = lazy(() => import('./pages/VistaImpresionRecetario').then(m => ({ default: m.VistaImpresionRecetario })))
const VistaImpresionDietas       = lazy(() => import('./pages/VistaImpresionDietas').then(m => ({ default: m.VistaImpresionDietas })))
const VistaImpresionProductividad = lazy(() => import('./pages/VistaImpresionProductividad').then(m => ({ default: m.VistaImpresionProductividad })))
const TableroMaestro             = lazy(() => import('./pages/TableroMaestro').then(m => ({ default: m.TableroMaestro })))
const Instructivo                = lazy(() => import('./pages/Instructivo').then(m => ({ default: m.Instructivo })))

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

  const fallbackCarga = (
    <div style={pantallaCargando}>
      <p>Cargando...</p>
    </div>
  )

  return (
    <BrowserRouter>
      <Suspense fallback={fallbackCarga}>
        <Routes>
          <Route
            path="/"
            element={<Dashboard perfil={perfil} onCerrarSesion={cerrarSesion} />}
          />
          <Route path="/servicio/:servicioId" element={<VistaServicio />} />
          <Route path="/tablero" element={<TableroMaestro />} />
          <Route path="/instructivo" element={<Instructivo />} />
          <Route path="/imprimir/dietas/:servicioId" element={<VistaImpresionDietas />} />
          <Route path="/imprimir/productividad/:anio/:mes" element={<VistaImpresionProductividad />} />
          <Route path="/imprimir/recetario/:servicioId" element={<VistaImpresionRecetario />} />
          <Route path="/imprimir/control/:servicioId" element={<VistaImpresionControl />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
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
