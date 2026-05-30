// src/pages/components/ChatPanel.tsx
// Panel flotante de chat. Funciona en dos modos:
//   - Modo servicio (se pasa servicioId/servicioNombre): canales = el
//     propio servicio + global. Es el comportamiento de las vistas de
//     servicio.
//   - Modo tablero (se pasa la lista `servicios`): canales = global +
//     todos los servicios visibles. El icono del tablero se ilumina con
//     cualquier mensaje nuevo (global o de cualquier servicio).
//
// El botón flotante se "ilumina" (glow pulsante) cuando hay mensajes sin
// leer en cualquiera de sus canales, igual en ambos modos.
//
// Realtime: usa supabase.channel() con postgres_changes para recibir
// mensajes nuevos sin polling. RLS ya limita qué canales recibe cada rol.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface Mensaje {
  id: string;
  canal: string;
  remitente: string;
  contenido: string;
  creado_en: string;
  eliminado: boolean;
  remitente_nombre?: string;
  remitente_rol?: string;
}

interface ServicioChat {
  id: number;
  nombre: string;
}

interface Props {
  // Modo servicio:
  servicioId?: number;
  servicioNombre?: string;
  // Modo tablero: lista de servicios visibles para el usuario.
  servicios?: ServicioChat[];
}

interface Canal {
  canal: string;
  etiqueta: string;
  icono: string;
}

export const ChatPanel: React.FC<Props> = ({ servicioId, servicioNombre, servicios }) => {
  const { perfil } = useAuth();
  const esTablero = Array.isArray(servicios);

  // Lista de canales según el modo.
  const canales = useMemo<Canal[]>(() => {
    if (esTablero) {
      return [
        { canal: 'global', etiqueta: 'Global / Jefatura', icono: '🌐' },
        ...(servicios as ServicioChat[]).map(s => ({
          canal: `servicio:${s.id}`, etiqueta: s.nombre, icono: '🏥',
        })),
      ];
    }
    return [
      { canal: `servicio:${servicioId}`, etiqueta: servicioNombre || 'Mi servicio', icono: '🏥' },
      { canal: 'global', etiqueta: 'Global / Jefatura', icono: '🌐' },
    ];
  }, [esTablero, servicios, servicioId, servicioNombre]);

  const canalesSet = useMemo(() => new Set(canales.map(c => c.canal)), [canales]);

  const [abierto, setAbierto] = useState(false);
  const [canalActivo, setCanalActivo] = useState<string>(canales[0]?.canal ?? 'global');
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [perfiles, setPerfiles] = useState<Record<string, { nombre: string; rol: string }>>({});
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const listaRef = useRef<HTMLDivElement>(null);

  // Si los canales llegan tarde (p.ej. el tablero carga servicios async) y
  // el canal activo dejó de existir, lo reseteamos al primero disponible.
  useEffect(() => {
    if (!canalesSet.has(canalActivo)) {
      setCanalActivo(canales[0]?.canal ?? 'global');
    }
  }, [canalesSet, canalActivo, canales]);

  const etiquetaActiva = canales.find(c => c.canal === canalActivo)?.etiqueta || '';
  const esCanalGlobal = canalActivo === 'global';

  // Cargar mensajes del canal activo.
  useEffect(() => {
    if (!abierto) return;
    (async () => {
      const { data, error } = await supabase
        .from('chat_mensajes')
        .select('id, canal, remitente, contenido, creado_en, eliminado')
        .eq('canal', canalActivo)
        .eq('eliminado', false)
        .order('creado_en', { ascending: true })
        .limit(200);
      if (!error && data) {
        setMensajes(data as Mensaje[]);
        await hidratarRemitentes(data as Mensaje[]);
        setUnread(u => ({ ...u, [canalActivo]: 0 }));
      }
    })();
  }, [abierto, canalActivo]);

  // Realtime: recibir mensajes nuevos. El nombre del canal de Supabase
  // incluye perfilId para evitar que múltiples instancias compartan el
  // mismo y stackeen listeners.
  useEffect(() => {
    if (!perfil) return;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`chat-mensajes-${perfil.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' },
        async (payload) => {
          const m = payload.new as Mensaje;
          await hidratarRemitentes([m]);
          if (m.canal === canalActivo && abierto) {
            setMensajes(prev => prev.concat(m));
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
              listaRef.current?.scrollTo({ top: 999999, behavior: 'smooth' });
            }, 50);
          } else if (m.remitente !== perfil.id && canalesSet.has(m.canal)) {
            setUnread(u => ({ ...u, [m.canal]: (u[m.canal] || 0) + 1 }));
          }
        }
      )
      .subscribe();
    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      supabase.removeChannel(ch);
    };
  }, [perfil, canalActivo, abierto, canalesSet]);

  // Batch lookup de perfiles que aún no están en cache. Si hidrata 100
  // mensajes nuevos, hace UNA query con IN, no 100.
  const hidratarRemitentes = async (msgs: Mensaje[]) => {
    const faltantes = Array.from(new Set(msgs.map(m => m.remitente))).filter(id => !perfiles[id]);
    if (faltantes.length === 0) return;
    const { data } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, rol')
      .in('id', faltantes);
    if (data) {
      setPerfiles(prev => ({
        ...prev,
        ...Object.fromEntries(data.map((p: any) => [p.id, { nombre: p.nombre_completo, rol: p.rol }]))
      }));
    }
  };

  // Auto-scroll al abrir o cambiar de canal.
  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => listaRef.current?.scrollTo({ top: 999999 }), 100);
    return () => clearTimeout(t);
  }, [abierto, canalActivo]);

  const enviar = async () => {
    if (!perfil || !borrador.trim() || enviando) return;
    setEnviando(true);
    try {
      const { error } = await supabase
        .from('chat_mensajes')
        .insert({
          canal: canalActivo,
          remitente: perfil.id,
          contenido: borrador.trim(),
        });
      if (error) throw error;
      setBorrador('');
    } catch (e: any) {
      alert('No se pudo enviar el mensaje: ' + (e.message || 'error desconocido'));
    } finally {
      setEnviando(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const unreadTotal = useMemo(
    () => Object.values(unread).reduce((a, b) => a + b, 0),
    [unread]
  );
  const glow = unreadTotal > 0 && !abierto;

  const formatHora = (iso: string) => {
    const d = new Date(iso);
    const hoy = new Date();
    const esHoy = d.toDateString() === hoy.toDateString();
    const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mazatlan' });
    return esHoy ? hora : `${d.getDate()}/${d.getMonth()+1} ${hora}`;
  };

  const colorRol = (rol?: string): string => {
    switch (rol) {
      case 'jefe': return '#A32D2D';
      case 'subjefe':
      case 'supervisor': return '#7d5b2f';
      case 'gestor': return '#0E6755';
      default: return '#888';
    }
  };

  const etiquetaRol = (rol?: string): string => {
    switch (rol) {
      case 'jefe': return 'JEFE';
      case 'subjefe': return 'SUBJEFE';
      case 'supervisor': return 'SUPERV.';
      case 'gestor': return 'GESTOR';
      case 'enfermera': return 'ENF.';
      default: return '';
    }
  };

  const muchosCanales = canales.length > 2;

  return (
    <>
      {/* keyframes del glow: no se pueden expresar como estilo inline */}
      <style>{`
        @keyframes chatGlowPulse {
          0%, 45% { box-shadow: 0 0 0 6px rgba(163,45,45,0.55), 0 0 30px 12px rgba(163,45,45,0.95); background-color: #A32D2D; }
          55%, 100% { box-shadow: 0 4px 14px rgba(0,0,0,0.3); background-color: #0E6755; }
        }
      `}</style>

      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(o => !o)}
        style={{ ...botonFlotante, ...(glow ? { animation: 'chatGlowPulse 0.85s ease-in-out infinite' } : {}) }}
        title={glow ? 'Tienes mensajes nuevos' : 'Chat de servicios'}
      >
        💬
        {unreadTotal > 0 && !abierto && (
          <span style={badge}>{unreadTotal > 99 ? '99+' : unreadTotal}</span>
        )}
      </button>

      {/* Panel */}
      {abierto && (
        <div style={panel}>
          <div style={panelHeader}>
            <div style={panelTitulo}>💬 Chat</div>
            <button onClick={() => setAbierto(false)} style={botonCerrar} aria-label="Cerrar">✕</button>
          </div>

          <div style={tabs}>
            {canales.map(c => {
              const activo = c.canal === canalActivo;
              const u = unread[c.canal] || 0;
              return (
                <button
                  key={c.canal}
                  onClick={() => setCanalActivo(c.canal)}
                  style={{
                    ...(activo ? tabActivo : tabInactivo),
                    flex: muchosCanales ? '0 0 auto' : '1 1 0',
                    minWidth: muchosCanales ? 96 : undefined,
                    maxWidth: 168,
                  }}
                  title={c.etiqueta}
                >
                  <span style={tabTexto}>{c.icono} {c.etiqueta}</span>
                  {u > 0 && !activo && <span style={tabBadge}>{u > 99 ? '99+' : u}</span>}
                </button>
              );
            })}
          </div>

          <div ref={listaRef} style={lista}>
            {mensajes.length === 0 ? (
              <div style={vacio}>
                No hay mensajes todavía.<br />
                {esCanalGlobal
                  ? 'Escribe el primero para todo el hospital y la jefatura.'
                  : 'Escribe el primero para este servicio.'}
              </div>
            ) : (
              mensajes.map(m => {
                const p = perfiles[m.remitente];
                const yo = m.remitente === perfil?.id;
                return (
                  <div key={m.id} style={{ ...msgWrap, justifyContent: yo ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      ...burbuja,
                      background: yo ? '#0E6755' : '#fff',
                      color: yo ? '#fff' : '#265C4E',
                      borderColor: yo ? '#0E6755' : '#C39C59',
                    }}>
                      {!yo && (
                        <div style={remitenteInfo}>
                          <span style={remitenteNombre}>{p?.nombre || 'Cargando...'}</span>
                          {p?.rol && (
                            <span style={{ ...remitenteRol, background: colorRol(p?.rol) }}>
                              {etiquetaRol(p?.rol)}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={msgTexto}>{m.contenido}</div>
                      <div style={{ ...msgHora, color: yo ? 'rgba(255,255,255,0.7)' : '#888' }}>
                        {formatHora(m.creado_en)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={inputArea}>
            <textarea
              value={borrador}
              onChange={e => setBorrador(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={esCanalGlobal
                ? 'Escribe al hospital y la jefatura...'
                : `Escribe a ${etiquetaActiva}...`}
              style={textarea}
              rows={2}
              disabled={enviando}
            />
            <button
              onClick={enviar}
              disabled={!borrador.trim() || enviando}
              style={botonEnviar}
            >
              {enviando ? '...' : '➤'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ---- estilos ----
const botonFlotante: React.CSSProperties = {
  position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%',
  background: '#0E6755', color: '#fff', border: 'none', fontSize: 24, cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(0,0,0,0.3)', zIndex: 950,
};
const badge: React.CSSProperties = {
  position: 'absolute', top: -4, right: -4, background: '#A32D2D', color: '#fff',
  borderRadius: 10, padding: '2px 6px', fontSize: 11, fontWeight: 700,
  border: '2px solid #fff', minWidth: 20, textAlign: 'center',
};
const panel: React.CSSProperties = {
  position: 'fixed', bottom: 90, right: 24, width: 380, maxWidth: 'calc(100vw - 32px)',
  height: 560, maxHeight: 'calc(100vh - 120px)',
  background: '#fdfaf2', border: '2px solid #C39C59', borderRadius: 10,
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
  zIndex: 951,
};
const panelHeader: React.CSSProperties = {
  background: '#0E6755', color: '#fff', padding: '10px 14px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderRadius: '8px 8px 0 0',
};
const panelTitulo: React.CSSProperties = { fontWeight: 700, fontSize: 15 };
const botonCerrar: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18,
};
const tabs: React.CSSProperties = {
  display: 'flex', borderBottom: '1px solid #C39C59', overflowX: 'auto',
};
const tabInactivo: React.CSSProperties = {
  padding: '8px 8px', border: 'none', background: '#F5F1E8', color: '#265C4E',
  cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', position: 'relative',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
};
const tabActivo: React.CSSProperties = {
  ...tabInactivo, background: '#fff', color: '#0E6755', borderBottom: '2px solid #0E6755',
};
const tabTexto: React.CSSProperties = {
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const tabBadge: React.CSSProperties = {
  marginLeft: 2, background: '#A32D2D', color: '#fff', borderRadius: 10, padding: '1px 5px',
  fontSize: 10, fontWeight: 700, flex: '0 0 auto',
};
const lista: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: 10, background: '#fdfaf2' };
const vacio: React.CSSProperties = { padding: 40, textAlign: 'center', color: '#888', fontSize: 13, lineHeight: 1.6 };
const msgWrap: React.CSSProperties = { display: 'flex', marginBottom: 8 };
const burbuja: React.CSSProperties = {
  maxWidth: '78%', padding: '6px 10px', borderRadius: 12, border: '1px solid',
  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
};
const remitenteInfo: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 };
const remitenteNombre: React.CSSProperties = { fontSize: 11, fontWeight: 700 };
const remitenteRol: React.CSSProperties = {
  fontSize: 9, color: '#fff', padding: '1px 5px', borderRadius: 8, fontWeight: 700, letterSpacing: 0.3,
};
const msgTexto: React.CSSProperties = { fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
const msgHora: React.CSSProperties = { fontSize: 9, textAlign: 'right', marginTop: 2 };
const inputArea: React.CSSProperties = {
  display: 'flex', gap: 6, padding: 8, borderTop: '1px solid #C39C59', background: '#F5F1E8',
};
const textarea: React.CSSProperties = {
  flex: 1, border: '1px solid #C39C59', borderRadius: 6, padding: '6px 8px',
  fontSize: 13, resize: 'none', fontFamily: 'inherit', background: '#fff', color: '#265C4E',
};
const botonEnviar: React.CSSProperties = {
  background: '#0E6755', color: '#fff', border: 'none', borderRadius: 6, padding: '0 16px',
  fontSize: 16, cursor: 'pointer', fontWeight: 700,
};
