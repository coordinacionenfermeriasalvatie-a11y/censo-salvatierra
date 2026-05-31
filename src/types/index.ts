export type Rol = 'jefe' | 'subjefe' | 'supervisor' | 'gestor' | 'enfermera'
// Turnos de fin de semana:
//   ESPECIAL_D / ESPECIAL_N = Sáb/Dom Y días festivos (diurno 07:00–21:00 /
//                             nocturno 19:00–09:00).
//   ACUMULADA               = un solo turno, solo Sáb/Dom (sin festivos):
//                             sábado 07:00–22:00 y domingo 07:00 corrido hasta
//                             el lunes 09:00.
// Legacy (se normalizan en accesoHorario.ts): 'JORNADA'/'JORNADA_N' → ESPECIAL;
// 'ACUMULADA_D'/'ACUMULADA_N' → ACUMULADA.
export type Turno =
  | 'M'
  | 'V'
  | 'N'
  | 'ESPECIAL_D'
  | 'ESPECIAL_N'
  | 'ACUMULADA'
export type Genero = 'MASCULINO' | 'FEMENINO'
export type EstadoPaciente = 'ACTIVO' | 'EGRESADO' | 'TRASLADADO'
export type EstadoCama = 'DISPONIBLE' | 'OCUPADA'

// Roles que ven todo el hospital (todos los servicios + tablero completo)
export const ROLES_ADMIN_GLOBAL: Rol[] = ['jefe', 'subjefe', 'supervisor']

// Roles que ven solo su servicio asignado
export const ROLES_SCOPE_SERVICIO: Rol[] = ['gestor', 'enfermera']

// Roles autorizados a entrar al TableroMaestro (la pagina /tablero)
export const ROLES_VEN_TABLERO: Rol[] = ['jefe', 'subjefe', 'supervisor', 'gestor']

// Roles que pueden ver todos los tabs (Dia/Semana/Mes). Otros solo Dia.
// Solo el Jefe de Enfermeria ve el Tablero Maestro completo;
// subjefe/supervisor/gestor quedan en vista del dia (tablero general).
export const ROLES_TABLERO_COMPLETO: Rol[] = ['jefe']

// Helpers
export function esAdminGlobal(rol: Rol | undefined | null): boolean {
  return rol != null && ROLES_ADMIN_GLOBAL.includes(rol)
}
export function tieneScopeDeServicio(rol: Rol | undefined | null): boolean {
  return rol != null && ROLES_SCOPE_SERVICIO.includes(rol)
}

export interface Perfil {
  id: string
  matricula: string
  nombre_completo: string
  rol: Rol
  servicio_id: number | null
  // Servicios ADICIONALES que administra un gestor, además de servicio_id.
  // Permite que una sola cuenta gestione varios servicios (ej. HH1 + HH2).
  servicios_extra?: number[] | null
  turno_principal: string | null
  activo: boolean
  titulo_display?: string | null
  es_admin_sistema?: boolean
  // Grupo de supervisión (1 ó 2) para rol 'supervisor'. NULL/ausente = global.
  supervision?: number | null
  // Exime a un gestor/enfermera de la restricción de horario por turno:
  // si es TRUE, esa cuenta entra 24/7 (lo activa el administrador). Ver mig 83.
  acceso_24_7?: boolean
  // Grupo del turno NOCTURNO ('A' ó 'B') para gestor/enfermera con
  // turno_principal = 'N'. Los grupos se alternan por fecha (ver
  // accesoHorario.ts). NULL = no rota (entra toda noche en su ventana). Mig 83.
  grupo_nocturno?: 'A' | 'B' | null
}

/** Todos los servicios que un perfil con scope de servicio (gestor/enfermera)
 *  administra: su servicio_id más servicios_extra, deduplicado. Vacío si no
 *  tiene servicio asignado. */
export function serviciosDeScope(
  p: Pick<Perfil, 'servicio_id' | 'servicios_extra'> | null | undefined
): number[] {
  if (!p) return []
  const ids = new Set<number>()
  if (p.servicio_id != null) ids.add(p.servicio_id)
  for (const s of p.servicios_extra ?? []) {
    if (s != null) ids.add(s)
  }
  return [...ids]
}

/** Para un supervisor con grupo asignado devuelve su número de supervisión
 *  (1 ó 2); null = alcance global (jefe/subjefe, o supervisor sin grupo). */
export function supervisionDeScope(
  p: Pick<Perfil, 'rol' | 'supervision'> | null | undefined
): 1 | 2 | null {
  if (!p) return null
  if (p.rol === 'supervisor' && (p.supervision === 1 || p.supervision === 2)) {
    return p.supervision
  }
  return null
}

/** Capitaliza la primera letra de un rol. Ej: 'gestor' → 'Gestor'. */
export function formatearRol(rol: Rol | string | null | undefined): string {
  if (!rol) return ''
  const s = String(rol)
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Devuelve el título visible: `titulo_display` si está definido, sino rol capitalizado. */
export function formatearTitulo(p: Pick<Perfil, 'rol' | 'titulo_display'> | null | undefined): string {
  if (!p) return ''
  return p.titulo_display || formatearRol(p.rol)
}

/** TRUE si el perfil es jefe o tiene la flag es_admin_sistema.
 *  Da acceso a 'En línea ahora' + Auditoría histórica completa. */
export function esJefeOAdmin(p: Pick<Perfil, 'rol' | 'es_admin_sistema'> | null | undefined): boolean {
  if (!p) return false
  return p.rol === 'jefe' || p.es_admin_sistema === true
}

export interface Servicio {
  id: number
  codigo: string
  nombre: string
  total_camas: number
  orden: number
  supervision?: number | null
}

export interface Subservicio {
  id: number
  servicio_id: number
  nombre: string
  orden: number
}

export interface Cama {
  id: number
  subservicio_id: number
  numero_cama: string
  activa: boolean
}

export interface Paciente {
  id: string
  cama_id: number
  nombre_paciente: string
  edad: number
  genero: Genero
  nss_curp: string | null
  diagnostico_ingreso: string
  especialidad_id: number | null
  fecha_ingreso: string
  hora_ingreso: string
  fecha_egreso: string | null
  hora_egreso: string | null
  motivo_egreso_id: number | null
  dias_estancia: number | null
  observaciones: string | null
  estado: EstadoPaciente
  capturado_por: string
  capturado_en: string
  sellado: boolean
}

export interface OcupacionServicio {
  servicio_id: number
  codigo: string
  servicio: string
  total_camas: number
  camas_ocupadas: number
  camas_disponibles: number
  porcentaje_ocupacion: number
  // Extras = camillas + sillas (no censables). v_ocupacion_servicios los expone.
  extras_ocupados?: number
  extras_totales?: number
  orden: number
  supervision?: number | null
}

export interface CamaEstado {
  cama_id: number
  servicio_id: number
  servicio: string
  subservicio_id: number
  subservicio: string
  numero_cama: string
  paciente_id: string | null
  nombre_paciente: string | null
  edad: number | null
  genero: Genero | null
  fecha_ingreso: string | null
  hora_ingreso: string | null
  diagnostico_ingreso: string | null
  estado: EstadoPaciente | null
  estado_cama: EstadoCama
}
