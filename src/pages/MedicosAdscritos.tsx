// Administración del catálogo de Médicos Adscritos.
// Alimenta el dropdown de "Médico prescriptor" en la receta controlada:
// al elegir un nombre se autocompletan cédula y especialidad (editables).
//
// Acceso: jefe, subjefe, supervisor (admin global). Se entrega vacío;
// la captura la hace supervisión manualmente desde aquí.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { ROLES_ADMIN_GLOBAL } from '../types';

interface Medico {
  id: string;
  nombre: string;
  cedula: string | null;
  especialidad: string | null;
  activo: boolean;
}

export const MedicosAdscritos: React.FC = () => {
  const { perfil } = useAuth();
  const navigate = useNavigate();

  const [lista, setLista] = useState<Medico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase.from('medicos_adscritos')
      .select('id, nombre, cedula, especialidad, activo')
      .order('activo', { ascending: false })
      .order('nombre');
    setLista((data || []) as Medico[]);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const limpiarForm = () => {
    setEditId(null);
    setNombre('');
    setCedula('');
    setEspecialidad('');
    setError(null);
  };

  const guardar = async () => {
    if (!nombre.trim()) { setError('El nombre del médico es obligatorio.'); return; }
    setGuardando(true);
    setError(null);
    const payload = {
      nombre: nombre.trim(),
      cedula: cedula.trim() || null,
      especialidad: especialidad.trim() || null,
    };
    const { error: err } = editId
      ? await supabase.from('medicos_adscritos').update(payload).eq('id', editId)
      : await supabase.from('medicos_adscritos').insert(payload);
    setGuardando(false);
    if (err) { setError(err.message); return; }
    limpiarForm();
    cargar();
  };

  const editar = (m: Medico) => {
    setEditId(m.id);
    setNombre(m.nombre);
    setCedula(m.cedula ?? '');
    setEspecialidad(m.especialidad ?? '');
    setError(null);
  };

  const toggleActivo = async (m: Medico) => {
    await supabase.from('medicos_adscritos').update({ activo: !m.activo }).eq('id', m.id);
    cargar();
  };

  const eliminar = async (m: Medico) => {
    if (!window.confirm(`¿Eliminar a "${m.nombre}" del catálogo? Las recetas ya emitidas no se ven afectadas.`)) return;
    const { error: err } = await supabase.from('medicos_adscritos').delete().eq('id', m.id);
    if (err) { alert('Error al eliminar: ' + err.message); return; }
    if (editId === m.id) limpiarForm();
    cargar();
  };

  if (!perfil) return <div style={msg}>Verificando perfil...</div>;

  if (!ROLES_ADMIN_GLOBAL.includes(perfil.rol)) {
    return (
      <div style={bloqueado}>
        🚫 Esta pantalla es exclusiva para jefatura, subjefatura y supervisión de enfermería.
        <button onClick={() => navigate('/')} style={btnVolver}>← Volver al inicio</button>
      </div>
    );
  }

  return (
    <div style={pagina}>
      <div style={header}>
        <div>
          <h1 style={titulo}>🩺 Médicos Adscritos</h1>
          <p style={subt}>
            Catálogo que alimenta el dropdown de médico en la receta de medicamento controlado.
            Al elegir un médico se autocompletan su cédula y especialidad (editables en el momento).
          </p>
        </div>
        <button onClick={() => navigate('/supervision')} style={btnVolver}>← Carpeta de Supervisión</button>
      </div>

      {/* Alta / edición */}
      <div style={tarjetaForm}>
        <div style={formTit}>{editId ? '✏️ Editar médico' : '➕ Agregar médico'}</div>
        <div style={gridForm}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={lbl}>Nombre completo *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Dra. María de Salvatierra" style={input} />
          </div>
          <div>
            <label style={lbl}>Cédula profesional</label>
            <input value={cedula} onChange={e => setCedula(e.target.value)} placeholder="ej. 1234567" style={input} />
          </div>
          <div>
            <label style={lbl}>Especialidad</label>
            <input value={especialidad} onChange={e => setEspecialidad(e.target.value)} placeholder="ej. Medicina Interna" style={input} />
          </div>
        </div>
        {error && <div style={errBanner}>⚠️ {error}</div>}
        <div style={formAcciones}>
          {editId && <button onClick={limpiarForm} disabled={guardando} style={btnSecundario}>Cancelar</button>}
          <button onClick={guardar} disabled={guardando} style={btnPrincipal}>
            {guardando ? 'Guardando...' : editId ? '💾 Guardar cambios' : '➕ Agregar'}
          </button>
        </div>
      </div>

      {/* Listado */}
      <div style={tarjetaLista}>
        {cargando ? (
          <div style={msg}>Cargando catálogo...</div>
        ) : lista.length === 0 ? (
          <div style={vacio}>
            Aún no hay médicos capturados. Usa el formulario de arriba para agregarlos.
          </div>
        ) : (
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Nombre</th>
                <th style={th}>Cédula</th>
                <th style={th}>Especialidad</th>
                <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m, i) => (
                <tr key={m.id} style={{ ...(i % 2 === 0 ? trAlt : {}), ...(m.activo ? {} : trInactivo) }}>
                  <td style={td}><strong>{m.nombre}</strong></td>
                  <td style={td}>{m.cedula || '—'}</td>
                  <td style={td}>{m.especialidad || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={m.activo ? chipActivo : chipInactivo}>{m.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => editar(m)} style={btnAccion}>✏️ Editar</button>
                    <button onClick={() => toggleActivo(m)} style={btnAccion}>{m.activo ? '🚫 Desactivar' : '✓ Activar'}</button>
                    <button onClick={() => eliminar(m)} style={btnEliminar}>✕ Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ============================================================
const pagina: React.CSSProperties = { padding: 24, background: '#F2EBE4', minHeight: '100vh' };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12 };
const titulo: React.CSSProperties = { color: '#0E6755', fontSize: 26, fontWeight: 700, margin: 0 };
const subt: React.CSSProperties = { color: '#7d5b2f', fontSize: 13, margin: '6px 0 0', maxWidth: 720, lineHeight: 1.5 };
const btnVolver: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', color: '#0E6755', padding: '10px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' };

const tarjetaForm: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', borderRadius: 8, padding: 16, marginBottom: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.05)' };
const formTit: React.CSSProperties = { fontWeight: 700, color: '#0E6755', fontSize: 15, marginBottom: 12 };
const gridForm: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: '#7d5b2f', fontWeight: 600, marginBottom: 3 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#fff' };
const formAcciones: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 };
const btnPrincipal: React.CSSProperties = { padding: '8px 16px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 };
const btnSecundario: React.CSSProperties = { padding: '8px 16px', background: '#fff', color: '#7d5b2f', border: '1px solid #C39C59', borderRadius: 4, cursor: 'pointer', fontWeight: 600 };
const errBanner: React.CSSProperties = { background: '#fbeaea', border: '1px solid #A32D2D', color: '#A32D2D', padding: 8, borderRadius: 4, fontSize: 12, marginTop: 10 };

const tarjetaLista: React.CSSProperties = { background: '#fff', border: '1px solid #C39C59', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' };
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: React.CSSProperties = { background: '#0E6755', color: '#fff', textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 700 };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #eee', color: '#333' };
const trAlt: React.CSSProperties = { background: '#F5F1E8' };
const trInactivo: React.CSSProperties = { opacity: 0.55 };
const chipActivo: React.CSSProperties = { background: '#DFF5E6', color: '#0E6755', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 };
const chipInactivo: React.CSSProperties = { background: '#eee', color: '#888', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 };
const btnAccion: React.CSSProperties = { background: '#fff', color: '#0E6755', border: '1px solid #C39C59', borderRadius: 3, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginLeft: 6 };
const btnEliminar: React.CSSProperties = { background: '#fff', color: '#A32D2D', border: '1px solid #A32D2D', borderRadius: 3, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginLeft: 6 };

const vacio: React.CSSProperties = { padding: 32, textAlign: 'center', color: '#888', fontStyle: 'italic' };
const msg: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#888', fontStyle: 'italic' };
const bloqueado: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#A32D2D', fontSize: 16, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' };
