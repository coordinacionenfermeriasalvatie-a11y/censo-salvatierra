// Modal para crear un recetario colectivo "a mayoreo".
// Solicitud de medicamentos a granel (NO por paciente): varios renglones
// de medicamento con dropdowns (vía/frecuencia) y catálogo buscable.
// Al guardar genera folio y muestra vista previa del documento.

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { formatearTitulo } from '../../types';

interface Props {
  servicioId: number;
  servicioNombre: string;
  onCerrar: () => void;
}

interface ItemForm {
  key: number;
  medicamento: string;
  dosis: string;
  via: string;
  frecuencia: string;
  cantidad: string;
}

// Mismos dropdowns que el recetario por paciente, para consistencia.
const VIAS_COMUNES = ['IV', 'IM', 'SC', 'VO', 'SL', 'INH', 'TOP', 'OFT', 'OTICO', 'RECTAL'];
const CANTIDADES_MAYOREO = Array.from({ length: 21 }, (_, i) => i); // 0 … 20
const FRECUENCIAS_COMUNES = [
  'CADA 1 HR', 'CADA 2 HRS', 'CADA 4 HRS', 'CADA 6 HRS', 'CADA 8 HRS',
  'CADA 12 HRS', 'CADA 24 HRS', 'CADA 48 HRS', 'CADA 72 HRS', 'DOSIS ÚNICA', 'PRN',
];

let _seq = 0;
const nuevoItem = (): ItemForm => ({ key: ++_seq, medicamento: '', dosis: '', via: '', frecuencia: '', cantidad: '' });

export const ModalRecetarioMayoreo: React.FC<Props> = ({ servicioId, servicioNombre, onCerrar }) => {
  const { perfil } = useAuth();
  const [catalogo, setCatalogo] = useState<{ id: number; nombre: string }[]>([]);
  const [area, setArea] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState<ItemForm[]>([nuevoItem()]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<{ id: string; folio: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('catalogo_medicamentos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      setCatalogo((data || []) as { id: number; nombre: string }[]);
    })();
  }, []);

  // Resolver medicamento_id por nombre exacto (case-insensitive).
  const idPorNombre = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of catalogo) m.set(c.nombre.trim().toUpperCase(), c.id);
    return m;
  }, [catalogo]);

  const actualizarItem = (key: number, campo: keyof ItemForm, valor: string) => {
    setItems(its => its.map(it => (it.key === key ? { ...it, [campo]: valor } : it)));
  };
  const agregarItem = () => setItems(its => [...its, nuevoItem()]);
  const quitarItem = (key: number) =>
    setItems(its => (its.length === 1 ? its : its.filter(it => it.key !== key)));

  const guardar = async () => {
    if (!perfil) { setError('Sin sesión activa'); return; }
    const itemsValidos = items.filter(it => it.medicamento.trim());
    if (itemsValidos.length === 0) { setError('Agrega al menos un medicamento'); return; }

    setGuardando(true);
    setError(null);

    const cabecera = {
      servicio_id: servicioId,
      servicio_nombre: servicioNombre,
      area: area.trim() || null,
      observaciones: observaciones.trim() || null,
      solicitante_id: perfil.id,
      solicitante_nombre: perfil.nombre_completo,
      solicitante_matricula: perfil.matricula,
      solicitante_rol: perfil.rol,
    };

    // Insertar cabecera con reintento por race del folio (igual que receta controlada).
    let cab: any = null;
    let err: any = null;
    for (let intento = 1; intento <= 3; intento++) {
      const r = await supabase.from('recetas_colectivas_mayoreo').insert(cabecera).select('id, folio').single();
      cab = r.data; err = r.error;
      if (!err) break;
      if (!/duplicate key|folio_key|recetas_colectivas_mayoreo_folio/i.test(err.message)) break;
      await new Promise(res => setTimeout(res, 80 * intento));
    }
    if (err) { setGuardando(false); setError(err.message); return; }

    const filas = itemsValidos.map((it, i) => ({
      receta_id: cab.id,
      orden: i + 1,
      medicamento_id: idPorNombre.get(it.medicamento.trim().toUpperCase()) ?? null,
      medicamento_nombre: it.medicamento.trim(),
      dosis: it.dosis.trim() || null,
      via: it.via || null,
      frecuencia: it.frecuencia || null,
      cantidad: it.cantidad.trim() || null,
    }));

    const { error: errItems } = await supabase.from('recetas_colectivas_mayoreo_items').insert(filas);
    setGuardando(false);
    if (errItems) { setError(`Se guardó el folio pero falló el detalle: ${errItems.message}`); return; }

    setExito({ id: cab.id, folio: cab.folio });
  };

  // Pantalla de confirmación con vista previa del documento guardado.
  if (exito) {
    return (
      <div style={overlay} onClick={onCerrar}>
        <div style={{ ...modal, maxWidth: 880 }} onClick={e => e.stopPropagation()}>
          <div style={headerExito}><div style={tituloChip}>✓ SOLICITUD GUARDADA</div></div>
          <div style={{ ...body, gap: 14 }}>
            <div style={exitoCheck}>
              <div style={exitoIcono}>✓</div>
              <div>
                <div style={exitoTitulo}>El recetario colectivo a mayoreo se guardó correctamente.</div>
                <div style={exitoFolio}>Folio: <strong>{exito.folio}</strong></div>
              </div>
            </div>
            <div style={previewWrap}>
              <div style={previewLabel}>👁 Vista previa — así se imprimirá la solicitud</div>
              <iframe
                src={`/imprimir/recetario-mayoreo/${exito.id}?preview=1`}
                title="Vista previa del recetario colectivo a mayoreo"
                style={previewFrame}
              />
            </div>
            <div style={avisoBox}>
              <div style={avisoTit}>⚠️ Acción pendiente</div>
              <div style={avisoTexto}>
                Imprime la solicitud y llévala a <strong>Supervisión de Enfermería</strong> para su
                <strong> autorización</strong> y el <strong>surtido en Farmacia</strong>, donde se recaban las firmas.
              </div>
            </div>
          </div>
          <div style={footer}>
            <button onClick={() => window.open(`/imprimir/recetario-mayoreo/${exito.id}`, '_blank', 'noopener,noreferrer')} style={btnSecundario}>
              🖨️ Imprimir
            </button>
            <button onClick={onCerrar} style={btnPrincipal}>Entendido</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <datalist id="catalogo-medicamentos-mayoreo">
          {catalogo.map(c => <option key={c.id} value={c.nombre} />)}
        </datalist>

        <div style={header}>
          <div>
            <div style={tituloChip}>📦 RECETARIO COLECTIVO A MAYOREO</div>
            <div style={subt}>{servicioNombre} · solicitud a granel (no por paciente)</div>
          </div>
          <button onClick={onCerrar} style={btnCerrar}>✕</button>
        </div>

        <div style={body}>
          {/* ÁREA */}
          <div style={seccion}>
            <div style={seccionTit}>1. Área / subservicio (opcional)</div>
            <input
              value={area}
              onChange={e => setArea(e.target.value)}
              placeholder="Ej. OBSERVACIÓN, SALA DE CHOQUE, RECUPERACIÓN TOCO..."
              style={input}
            />
          </div>

          {/* MEDICAMENTOS */}
          <div style={seccion}>
            <div style={seccionTit}>2. Medicamentos solicitados</div>
            <table style={tablaItems}>
              <thead>
                <tr>
                  <th style={{ ...thi, width: '34%' }}>Medicamento</th>
                  <th style={{ ...thi, width: '15%' }}>Dosis</th>
                  <th style={{ ...thi, width: '13%' }}>Vía</th>
                  <th style={{ ...thi, width: '18%' }}>Frecuencia</th>
                  <th style={{ ...thi, width: '12%' }}>Cantidad</th>
                  <th style={{ ...thi, width: '8%' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.key}>
                    <td style={tdi}>
                      <input
                        type="search"
                        list="catalogo-medicamentos-mayoreo"
                        value={it.medicamento}
                        onChange={e => actualizarItem(it.key, 'medicamento', e.target.value)}
                        placeholder="Escribe para buscar..."
                        style={inputCelda}
                      />
                    </td>
                    <td style={tdi}>
                      <input
                        value={it.dosis}
                        onChange={e => actualizarItem(it.key, 'dosis', e.target.value)}
                        placeholder="500 mg"
                        style={inputCelda}
                      />
                    </td>
                    <td style={tdi}>
                      <select value={it.via} onChange={e => actualizarItem(it.key, 'via', e.target.value)} style={inputCelda}>
                        <option value="">--</option>
                        {VIAS_COMUNES.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td style={tdi}>
                      <select value={it.frecuencia} onChange={e => actualizarItem(it.key, 'frecuencia', e.target.value)} style={inputCelda}>
                        <option value="">--</option>
                        {FRECUENCIAS_COMUNES.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    <td style={tdi}>
                      <select
                        value={it.cantidad}
                        onChange={e => actualizarItem(it.key, 'cantidad', e.target.value)}
                        style={{ ...inputCelda, textAlign: 'center' }}
                      >
                        <option value="">--</option>
                        {CANTIDADES_MAYOREO.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td style={{ ...tdi, textAlign: 'center' }}>
                      <button
                        onClick={() => quitarItem(it.key)}
                        disabled={items.length === 1}
                        title="Quitar renglón"
                        style={btnQuitar}
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={agregarItem} style={btnAgregar}>+ Agregar medicamento</button>
          </div>

          {/* OBSERVACIONES */}
          <div style={seccion}>
            <div style={seccionTit}>3. Observaciones (opcional)</div>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              rows={2}
              style={{ ...input, resize: 'vertical' as const }}
              placeholder="Notas para Farmacia / Supervisión..."
            />
          </div>

          {/* SOLICITANTE (auto) */}
          {perfil && (
            <div style={seccion}>
              <div style={seccionTit}>4. Solicitante (auto)</div>
              <div style={pacienteCard}>
                <div><strong>{perfil.nombre_completo}</strong> · Matrícula {perfil.matricula} · {formatearTitulo(perfil)}</div>
                <div style={{ fontSize: 11, color: '#666' }}>Queda asociado a tu sesión y se registra en la bitácora de auditoría.</div>
              </div>
            </div>
          )}

          {error && <div style={errBanner}>⚠️ {error}</div>}
        </div>

        <div style={footer}>
          <button onClick={onCerrar} disabled={guardando} style={btnSecundario}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={btnPrincipal}>
            {guardando ? 'Guardando...' : '💾 Guardar y generar folio'}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 16,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 8, width: '100%', maxWidth: 820,
  maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
};
const header: React.CSSProperties = {
  background: '#0E6755', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};
const tituloChip: React.CSSProperties = { fontSize: 14, fontWeight: 700, letterSpacing: 0.5 };
const subt: React.CSSProperties = { fontSize: 11, opacity: 0.9, marginTop: 2 };
const btnCerrar: React.CSSProperties = {
  background: 'transparent', border: '1px solid #fff', color: '#fff', borderRadius: 4,
  width: 32, height: 32, cursor: 'pointer', fontSize: 16,
};
const body: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 };
const seccion: React.CSSProperties = { border: '1px solid #eee', borderRadius: 6, padding: 12 };
const seccionTit: React.CSSProperties = { fontWeight: 700, color: '#0E6755', fontSize: 13, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #eee' };
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 10px',
  border: '1px solid #C39C59', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#fff',
};
const tablaItems: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', marginBottom: 10 };
const thi: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: '#7d5b2f', fontWeight: 700, padding: '2px 4px', borderBottom: '1px solid #eee' };
const tdi: React.CSSProperties = { padding: '3px 4px', verticalAlign: 'middle' };
const inputCelda: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '5px 6px',
  border: '1px solid #C39C59', borderRadius: 3, fontSize: 12, fontFamily: 'inherit', background: '#fff',
};
const btnQuitar: React.CSSProperties = {
  background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 3, width: 26, height: 26, cursor: 'pointer', fontWeight: 700,
};
const btnAgregar: React.CSSProperties = { padding: '7px 14px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const pacienteCard: React.CSSProperties = {
  background: '#fff7e0', border: '1px solid #C39C59', borderRadius: 4, padding: 8, fontSize: 12, lineHeight: 1.6,
};
const errBanner: React.CSSProperties = {
  background: '#fbeaea', border: '1px solid #A32D2D', color: '#A32D2D', padding: 8, borderRadius: 4, fontSize: 12,
};
const footer: React.CSSProperties = {
  padding: 12, borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 8,
};
const btnSecundario: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#7d5b2f', border: '1px solid #C39C59', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const btnPrincipal: React.CSSProperties = {
  padding: '8px 16px', background: '#0E6755', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700,
};
const headerExito: React.CSSProperties = {
  background: '#0E6755', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const exitoCheck: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };
const exitoIcono: React.CSSProperties = {
  flexShrink: 0, width: 44, height: 44, borderRadius: '50%', background: '#0E6755', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700,
};
const exitoTitulo: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#0E6755' };
const exitoFolio: React.CSSProperties = { fontSize: 13, color: '#444', marginTop: 2 };
const avisoBox: React.CSSProperties = { background: '#fff7e0', border: '1.5px solid #C39C59', borderRadius: 6, padding: 12 };
const avisoTit: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#7d5b2f', marginBottom: 6 };
const avisoTexto: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, color: '#3a3a3a' };
const previewWrap: React.CSSProperties = { border: '1px solid #C39C59', borderRadius: 6, overflow: 'hidden', background: '#e9e9e9' };
const previewLabel: React.CSSProperties = { background: '#0E6755', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', letterSpacing: 0.3 };
const previewFrame: React.CSSProperties = { width: '100%', height: 440, border: 'none', display: 'block', background: '#fff' };
