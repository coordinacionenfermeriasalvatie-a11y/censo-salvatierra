export type Rol = 'jefe' | 'subjefe' | 'supervisor' | 'gestor' | 'enfermera'
export type Turno = 'M' | 'V' | 'N' | 'JORNADA'
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
  turno_principal: string | null
  activo: boolean
}

export interface Servicio {
  id: number
  codigo: string
  nombre: string
  total_camas: number
  orden: number
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
