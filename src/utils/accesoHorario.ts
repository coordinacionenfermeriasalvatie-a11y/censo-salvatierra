// Restricción de acceso por turno asignado.
//
// gestor y enfermera (gestores del cuidado / jefes de servicio / operativos)
// solo pueden entrar al censo dentro de la ventana de su turno asignado
// (turno_principal), MÁS 1:30 (90 min) de tolerancia al terminar el turno
// para cerrar pendientes. jefe / subjefe / supervisor entran 24/7, igual que
// JORNADA y quien tenga el flag de administrador acceso_24_7.
//
// Las fronteras de turno son las oficiales del hospital (mig 67), en hora
// local del Pacífico de México (America/Mazatlan, UTC-7):
//   M = 08:00–14:29   V = 14:30–20:29   N = 20:30–07:59 (cruza medianoche)

import type { Perfil, Rol } from '../types'

const ROLES_RESTRINGIDOS: Rol[] = ['gestor', 'enfermera']

// 1:30 después de terminar el turno, para cerrar pendientes.
const TOLERANCIA_MIN = 90

// Ventana en minutos desde la medianoche local. `fin` puede pasar de 1440
// (24:00) cuando la ventana cruza la medianoche (turno Nocturno).
type Ventana = { inicio: number; fin: number }

// Ventana de ACCESO = ventana del turno + TOLERANCIA_MIN al final.
const VENTANAS: Record<'M' | 'V' | 'N', Ventana> = {
  M: { inicio: 8 * 60, fin: 14 * 60 + 30 + TOLERANCIA_MIN }, // 08:00–16:00
  V: { inicio: 14 * 60 + 30, fin: 20 * 60 + 30 + TOLERANCIA_MIN }, // 14:30–22:00
  N: { inicio: 20 * 60 + 30, fin: 24 * 60 + 8 * 60 + TOLERANCIA_MIN }, // 20:30–09:30 (+1 día)
}

type PartesLocal = { anio: number; mes: number; dia: number; minutos: number }

/** Año, mes, día y minutos-desde-medianoche en hora local del Pacífico
 *  (America/Mazatlan), sin importar la zona horaria del dispositivo. */
function partesLocalesMazatlan(ahora: Date): PartesLocal {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mazatlan',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ahora)
  const val = (t: string) => Number(partes.find(p => p.type === t)?.value ?? '0')
  return {
    anio: val('year'),
    mes: val('month'),
    dia: val('day'),
    minutos: val('hour') * 60 + val('minute'),
  }
}

/** Minutos desde la medianoche en hora local del Pacífico (America/Mazatlan). */
export function minutosLocalesMazatlan(ahora: Date = new Date()): number {
  return partesLocalesMazatlan(ahora).minutos
}

function dentroDeVentana(min: number, v: Ventana): boolean {
  if (v.fin <= 1440) return min >= v.inicio && min < v.fin
  // Cruza medianoche: [inicio, 24:00) ∪ [00:00, fin-24:00)
  return min >= v.inicio || min < v.fin - 1440
}

function turnoDe(perfil: Pick<Perfil, 'turno_principal'>): string {
  return (perfil.turno_principal ?? '').trim().toUpperCase()
}

function grupoDe(perfil: Pick<Perfil, 'grupo_nocturno'>): 'A' | 'B' | null {
  const g = (perfil.grupo_nocturno ?? '').trim().toUpperCase()
  return g === 'A' || g === 'B' ? g : null
}

/** Grupo nocturno ('A' | 'B') que está de guardia en la NOCHE vigente en este
 *  instante, o null si ahora no hay noche vigente (fuera de 20:30–09:30).
 *
 *  El nocturno se parte en dos grupos que se alternan por la PARIDAD de la
 *  fecha en que ARRANCA la noche: en junio (mes par) las noches de día NON las
 *  cubre A y las pares B; la regla se voltea cada mes. Equivale a: A cubre la
 *  noche cuando (día + mes) es impar; B cuando es par. Como la noche cruza la
 *  medianoche, de 00:00 a 09:29 la noche "arrancó ayer", así que se usa la
 *  fecha de inicio, no la del reloj. */
function grupoNocturnoDeGuardia(ahora: Date): 'A' | 'B' | null {
  const { anio, mes, dia, minutos } = partesLocalesMazatlan(ahora)
  let m = mes
  let d = dia
  if (minutos >= 20 * 60 + 30) {
    // 20:30–23:59: la noche arranca HOY (mes/día ya correctos).
  } else if (minutos < 9 * 60 + 30) {
    // 00:00–09:29: la noche arrancó AYER (usar fecha previa, vía UTC).
    const ayer = new Date(Date.UTC(anio, mes - 1, dia))
    ayer.setUTCDate(ayer.getUTCDate() - 1)
    m = ayer.getUTCMonth() + 1
    d = ayer.getUTCDate()
  } else {
    return null // 09:30–20:29: sin noche vigente.
  }
  return (d + m) % 2 === 1 ? 'A' : 'B'
}

/** TRUE si el rol está sujeto a la restricción de horario por turno. */
export function rolRestringidoPorHorario(rol: Rol): boolean {
  return ROLES_RESTRINGIDOS.includes(rol)
}

/** ¿Puede esta cuenta acceder al censo en este momento?
 *  - Roles globales (jefe/subjefe/supervisor): siempre.
 *  - acceso_24_7 o es_admin_sistema: siempre (excepción del administrador).
 *  - turno JORNADA: siempre.
 *  - turno M/V: solo dentro de su ventana (turno + 1:30 de tolerancia).
 *  - turno N: dentro de la ventana nocturna Y, si tiene grupo (A/B), solo las
 *    noches que le tocan a su grupo. N sin grupo entra cualquier noche.
 *  - sin turno asignado: NO (debe contactar a la jefatura). */
export function accesoPermitidoPorHorario(
  perfil: Pick<
    Perfil,
    'rol' | 'turno_principal' | 'grupo_nocturno' | 'acceso_24_7' | 'es_admin_sistema'
  >,
  ahora: Date = new Date()
): boolean {
  if (!rolRestringidoPorHorario(perfil.rol)) return true
  if (perfil.acceso_24_7 === true) return true
  if (perfil.es_admin_sistema === true) return true

  const turno = turnoDe(perfil)
  if (turno === 'JORNADA') return true

  if (turno === 'M' || turno === 'V') {
    return dentroDeVentana(minutosLocalesMazatlan(ahora), VENTANAS[turno])
  }

  if (turno === 'N') {
    if (!dentroDeVentana(minutosLocalesMazatlan(ahora), VENTANAS.N)) return false
    const grupo = grupoDe(perfil)
    if (grupo === null) return true // N sin grupo: entra cualquier noche en su ventana.
    return grupoNocturnoDeGuardia(ahora) === grupo
  }

  // Sin turno asignado (NULL / vacío) => bloquear.
  return false
}

/** Texto legible de la ventana de acceso permitida, para la pantalla de
 *  bloqueo. */
export function descripcionVentanaAcceso(
  perfil: Pick<Perfil, 'turno_principal' | 'grupo_nocturno'>
): string {
  switch (turnoDe(perfil)) {
    case 'M':
      return 'Tu turno es Matutino: puedes ingresar de 08:00 a 16:00 (turno 08:00–14:29 más 1:30 de tolerancia).'
    case 'V':
      return 'Tu turno es Vespertino: puedes ingresar de 14:30 a 22:00 (turno 14:30–20:29 más 1:30 de tolerancia).'
    case 'N': {
      const grupo = grupoDe(perfil)
      if (grupo !== null) {
        return `Eres Nocturno ${grupo}: solo puedes ingresar las noches que le tocan a tu grupo, de 20:30 a 09:30 (más 1:30 de tolerancia). Si esta noche no es de tu grupo, te toca descanso.`
      }
      return 'Tu turno es Nocturno: puedes ingresar de 20:30 a 09:30 (turno 20:30–07:59 más 1:30 de tolerancia).'
    }
    case 'JORNADA':
      return 'Tu turno es Jornada acumulada (acceso sin restricción de horario).'
    default:
      return 'No tienes un turno asignado. Contacta a la subjefatura de enfermería para que registre tu turno y puedas ingresar.'
  }
}
