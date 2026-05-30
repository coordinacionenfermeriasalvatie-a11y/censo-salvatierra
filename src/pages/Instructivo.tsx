// src/pages/Instructivo.tsx
// Instructivo de uso del sistema Censo Salvatierra.
// Cada sección está marcada con los roles que pueden usar esa función.
// Las secciones se filtran según el rol del usuario logueado.
//
// Accesible desde Dashboard. Imprimible. Mobile-friendly.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { Rol } from '../types';
import { esJefeOAdmin, formatearTitulo } from '../types';

interface Bloque {
  titulo: string;
  pasos: string[];
}

interface Seccion {
  key: string;
  numero: string;
  titulo: string;
  icono: string;
  subtitulo: string;
  color: string;
  contenido: Bloque[];
  /** Si está definido, solo se muestra a estos roles. Si es undefined, todos lo ven. */
  roles?: Rol[];
  /** Si está definido, además del rol debe ser admin del sistema (es_admin_sistema=true). */
  soloAdminSistema?: boolean;
}

const TODOS_GLOBAL: Rol[] = ['jefe','subjefe','supervisor'];
const TODOS_GESTOR_ARRIBA: Rol[] = ['jefe','subjefe','supervisor','gestor'];

const SECCIONES: Seccion[] = [
  // ============================================================
  // 0. PRIVILEGIOS POR ROL (visible para todos)
  // ============================================================
  {
    key: 'privilegios',
    numero: '0',
    titulo: 'Privilegios por rol — qué puede hacer cada quien',
    icono: '🔑',
    subtitulo: 'Resumen de lo que ve y puede hacer cada tipo de usuario',
    color: '#265C4E',
    contenido: [
      {
        titulo: '0.1. Enfermera (personal de piso)',
        pasos: [
          'Trabaja dentro de su servicio asignado.',
          'Captura y consulta de su servicio: 🏥 Censo, 🍽️ Dietas, 💊 Recetario, 📋 Control y 📊 Productividad.',
          'NO ve el Tablero Maestro ni la Carpeta de Supervisión.',
          'NO traslada ni cambia de cama (el chip 🔀 no le aparece).',
          '🆕 Acceso por turno: solo puede entrar dentro de la ventana de su turno asignado (M 07:00–15:00 · V 13:00–21:00 · N 19:30–08:30), con traslape para el cambio de guardia. Fuera de esa ventana ve una pantalla de bloqueo. Si ya está dentro y termina su ventana, el sistema la saca automáticamente (~30 s).',
          'Cada acción que realiza queda registrada con su nombre y la hora exacta.',
        ],
      },
      {
        titulo: '0.2. Gestor (jefe de servicio)',
        pasos: [
          'Administra UNO o VARIOS servicios (su servicio principal + servicios extra). Todo lo que ve queda acotado a su(s) servicio(s).',
          'Censo completo de su servicio: ingresar, egresar, trasladar/cambiar de cama (chip 🔀), editar datos y marcar camas no ocupables.',
          '🍽️ Dietas, 💊 Recetario, 📋 Control y 📊 Productividad de su servicio.',
          '💊 Receta de medicamento controlado: genera vales de psicotrópicos para sus pacientes. Mientras el vale está PENDIENTE puede imprimirlo; una vez que Supervisión lo aprueba o canjea, solo ve la VISTA PREVIA (ya no lo reimprime). Editar o anular un vale es exclusivo de jefatura/administrador.',
          '🆕 Tablero Maestro COMPLETO pero acotado a su servicio: selector Día / Semana / Mes + resumen ejecutivo mensual. Si su servicio incluye Hemodiálisis, también ve la sección 🩺 Hemodiálisis y Diálisis.',
          '🆕 Exporta un Excel de productividad acotado EXCLUSIVAMENTE a su(s) servicio(s) (botón "📊 Exportar Excel de mi servicio").',
          '🆕 Acceso por turno: solo entra dentro de la ventana de su turno asignado (M 07:00–15:00 · V 13:00–21:00 · N 19:30–08:30); fuera de eso ve pantalla de bloqueo y se le cierra la sesión al terminar la ventana. Los gestores "comodín" de emergencia tienen acceso 24/7 (ver Carpeta de Supervisión).',
          'NO ve la Auditoría, ni la Carpeta de Supervisión (bitácora global de vales, fondo fijo), ni datos de servicios ajenos.',
        ],
      },
      {
        titulo: '0.3. Supervisor de enfermería',
        pasos: [
          'Ve TODOS los servicios del hospital (administrador global).',
          'Carpeta de Supervisión: Bitácora de vales controlados (aprobar / rechazar / canjear), Fondo Fijo de Psicotrópicos (hoja del día), Tablero General y Auditoría.',
          'En el Tablero General ve SOLO la vista del Día (no Semana/Mes).',
          'En la Auditoría ve SOLO los cambios de HOY y de SU TURNO ACTUAL (M/V/N por hora Mazatlán).',
          '🆕 Acceso 24/7: por su rol entra a cualquier hora, sin la restricción de turno que aplica a gestores y enfermeras.',
          '🆕 En caso de ausencia de un titular, asigna un gestor "comodín" de emergencia (cuentas multiservicios 24/7 que viven en la Carpeta de Supervisión).',
          'NO ve la hoja semanal ni el histórico de psicotrópicos (exclusivo de jefatura/administrador).',
        ],
      },
      {
        titulo: '0.4. Subjefe de enfermería',
        pasos: [
          'Mismos privilegios globales que el supervisor: ve todos los servicios y la Carpeta de Supervisión completa.',
          'Si además es Administrador del Sistema, gana los privilegios máximos de jefatura (ver 0.5).',
        ],
      },
      {
        titulo: '0.5. Jefatura y Administrador del Sistema',
        pasos: [
          'Privilegios máximos sobre TODO el hospital.',
          'Tablero Maestro completo Día / Semana / Mes de todos los servicios, con exportación hospitalaria (Excel consolidado + 1 hoja por servicio + PDF).',
          'Auditoría completa de los últimos 30 días (todos los turnos, sin restricción).',
          'Hoja semanal e histórico inmutable de psicotrópicos (snapshots).',
          '🆕 ÚNICO rol que puede EDITAR o ANULAR una receta de medicamento controlado ya emitida (los gestores solo crean; supervisión/subjefatura aprueban y canjean).',
          'Acceso 24/7 sin restricción de turno.',
          'Panel "🟢 En línea ahora" y alta de nuevos colaboradores.',
        ],
      },
      {
        titulo: '0.6. ¿Quién ve el Tablero Maestro y con qué alcance?',
        pasos: [
          'Jefatura / Administrador: todo el hospital · Día/Semana/Mes · auditoría completa · exportación hospitalaria.',
          'Subjefe / Supervisor: todo el hospital · SOLO el Día · auditoría limitada a hoy/turno.',
          'Gestor: SOLO su(s) servicio(s) · Día/Semana/Mes + resumen ejecutivo + Excel acotado · SIN auditoría.',
          'Enfermera: no tiene acceso al Tablero Maestro.',
        ],
      },
    ],
  },

  // ============================================================
  // 1. ARRANQUE
  // ============================================================
  {
    key: 'arranque',
    numero: '1',
    titulo: 'Cómo entrar y abrir un servicio',
    icono: '🚪',
    subtitulo: 'Login, navegación al servicio, instalación como app',
    color: '#0E6755',
    contenido: [
      {
        titulo: '1.1. Iniciar sesión',
        pasos: [
          'Abre la liga: censo-salvatierra.pages.dev',
          'Captura tu correo (con el que te dieron de alta) y tu contraseña.',
          'Toca "Iniciar sesión".',
          'Si olvidaste tu contraseña, toca "Olvidé mi contraseña" y sigue las instrucciones del correo que te llegará.',
        ],
      },
      {
        titulo: '1.2. Instalar como app en tu dispositivo',
        pasos: [
          'iPhone/iPad (Safari): ícono compartir 📤 → "Agregar a pantalla de inicio".',
          'Android (Chrome): menú 3 puntos ⋮ → "Instalar aplicación".',
          'Después aparece como ícono en tu pantalla, igual que cualquier app.',
        ],
      },
      {
        titulo: '1.3. Entrar a un servicio',
        pasos: [
          'En la pantalla principal verás tarjetas con los servicios del hospital y su porcentaje de ocupación.',
          'Toca la tarjeta del servicio que quieras revisar (ej. URGENCIAS, PEDIATRIA, etc.).',
          'Dentro del servicio aparecen las camas por subservicio (OBSERVACIÓN, ANEXOS, CAMILLAS, etc.).',
          'Arriba ves 5 pestañas: 🏥 Censo · 🍽️ Dietas · 💊 Recetario · 📋 Control · 📊 Productividad.',
          'La pestaña activa por default es Censo.',
        ],
      },
      {
        titulo: '1.4. 🆕 Horario de acceso por turno (gestores y enfermeras)',
        pasos: [
          'Gestores y enfermeras solo pueden entrar dentro de la ventana de acceso de su turno asignado, con traslape entre turnos para cubrir el cambio de guardia.',
          'Ventanas de acceso (hora Mazatlán, UTC-7): Matutino 07:00–15:00 · Vespertino 13:00–21:00 · Nocturno 19:30–08:30 del día siguiente.',
          'Nocturnos: el turno se divide en dos grupos (A y B) que se alternan noche por noche. Cada quien solo entra las noches que le tocan a su grupo; si esta noche no es de tu grupo, es tu descanso.',
          'Si intentas entrar fuera de tu ventana, ves una pantalla que te indica tu horario y un botón para cerrar sesión.',
          'Si ya estabas dentro y termina tu turno, el sistema te saca automáticamente (en ~30 segundos) sin necesidad de recargar.',
          'Jefatura, subjefatura y supervisión entran 24/7 (sin esta restricción). También las cuentas marcadas con acceso 24/7 (gestores comodín de emergencia y casos especiales autorizados).',
          'Si necesitas ingresar fuera de tu turno, contacta a la subjefatura de enfermería.',
        ],
      },
    ],
  },

  // ============================================================
  // 2. HOJA CENSO
  // ============================================================
  {
    key: 'censo',
    numero: '2',
    titulo: 'Hoja Censo',
    icono: '🏥',
    subtitulo: 'Ingresos, egresos, traslados y datos del paciente',
    color: '#1F4E79',
    contenido: [
      {
        titulo: '2.1. Ingresar un paciente nuevo',
        pasos: [
          'Localiza la cama disponible donde se asignará el paciente.',
          'Toca la cama vacía. Aparece un selector con dos opciones:',
          '   • 📝 "Registrar ingreso de paciente" → continúa con los pasos siguientes',
          '   • 🚫 "Marcar como no ocupable" → ver 2.5 (cama descompuesta / sin colchón)',
          'Llena los campos básicos: Nombre completo (en MAYÚSCULAS, formato APELLIDOS NOMBRES), Edad, Sexo, Diagnóstico de ingreso, Especialidad.',
          'IDENTIFICACIÓN DEL PACIENTE: elige UNA de las dos pestañas:',
          '   • 📅 Fecha de nacimiento — selecciona la fecha en el calendario',
          '   • 🪪 CURP — escribe los 18 caracteres en mayúsculas',
          'La Fecha y Hora de ingreso se llenan solas con el momento actual (puedes ajustarlas si el paciente ingresó antes).',
          '🪪 DATOS PARA LA TARJETA DE IDENTIFICACIÓN (opcional pero recomendado):',
          '   • Grupo y RH (O+, A-, AB+, etc.). Se imprimirá en la ficha del paciente.',
          '   • Alergias — escribe las alergias del paciente. Si está en blanco, la ficha imprime "NO" alergias. Si escribes algo, imprime "SI" y el texto inline.',
          '⚠️ EVALUACIÓN INICIAL DE RIESGOS (se traza a CONTROL automáticamente):',
          '   • Riesgo de Caídas: ALTO / MEDIANO / BAJO',
          '   • Riesgo Úlcera por Presión (UPP): ALTO / MEDIANO / BAJO',
          '🦠 PRECAUCIÓN DE AISLAMIENTO (opcional, dropdown universal):',
          '   • 🔴 Estándar · 🟢 Por gota · 🔵 Por vía aérea · 🟡 Por contacto · ⬜ Protector · 🟫 Contacto plus',
          '   Lo que elijas se traza automáticamente a 3 lugares: aparece como evento en CONTROL (sección Aislamiento), aparece como chip rojo junto al nombre en DIETAS, y suma +1 a K03 en PRODUCTIVIDAD.',
          'Si tiene observaciones especiales adicionales, escríbelas en el campo Observaciones.',
          'Toca "✓ Registrar ingreso" para confirmar.',
        ],
      },
      {
        titulo: '2.2. Ver y editar datos del paciente',
        pasos: [
          'Toca la cama ocupada del paciente que quieres revisar.',
          'Se expande la tarjeta del paciente con todos sus datos.',
          'Si necesitas corregir algún dato (nombre, edad, diagnóstico), toca el ícono ✎ junto al campo.',
          'Modifica y guarda con ✓.',
          'Los datos clínicos persistentes (grupo sanguíneo, alergias, escala del dolor) se editan desde la pestaña Control (sección "🪪 Tarjeta de Identificación").',
        ],
      },
      {
        titulo: '2.3. Egresar un paciente (alta / defunción / traslado / fuga)',
        pasos: [
          'Toca la cama del paciente a egresar.',
          'En la tarjeta del paciente, toca "Egresar".',
          'Selecciona el motivo de egreso: Alta por curación, Alta por máximo beneficio, Traslado, Defunción, Fuga, Otro.',
          'La fecha y hora de egreso se llenan solas con el momento actual (ajustables si corresponde).',
          'Toca "Confirmar egreso".',
          'El paciente pasa al historial y la cama queda disponible.',
        ],
      },
      {
        titulo: '2.4. Camas no censables (CAMILLAS y SILLAS en URGENCIAS)',
        pasos: [
          'Las camillas (PASILLO 01–10) y sillas (SILLA 1–8) funcionan igual que cualquier cama: se ingresa, se egresa, se llenan las otras hojas.',
          'Diferencia: NO cuentan para el porcentaje de ocupación censable del servicio.',
          'Se ven con franjas diagonales y la etiqueta "NO CENSABLE".',
        ],
      },
      {
        titulo: '2.5. Marcar una cama como NO OCUPABLE (sin paciente)',
        pasos: [
          'Si una cama no se puede ocupar (descompuesta, sin colchón, en reparación, aislamiento por limpieza terminal, etc.) y NO quieres ingresar un paciente para registrarlo:',
          'Toca la cama disponible. En el selector elige "🚫 Marcar como no ocupable".',
          'Selecciona la causa: SIN CAMA / DESCOMPUESTA / SIN COLCHÓN / EN REPARACIÓN / AISLAMIENTO / OTRA.',
          '   • AISLAMIENTO se usa típicamente tras egresar un paciente con precauciones, mientras el cuarto está en limpieza terminal o descontaminación.',
          'Escribe una nota opcional (ej. "Motor del respaldo no enciende, reportado a biomédica").',
          'Toca "🚫 Marcar no ocupable".',
          'La cama queda en rojo rayado con la causa visible en el censo.',
          '⚡ IMPORTANTE: Mientras la cama esté bloqueada, NO cuenta como censable en el % de ocupación del servicio ni del hospital. El total censable se ajusta automáticamente. Al liberarla vuelve a contar.',
          'Para LIBERAR la cama: toca la cama bloqueada, ve la causa actual y toca "✓ Liberar cama". Vuelve a estado DISPONIBLE.',
        ],
      },
      {
        titulo: '2.6. Trasladar / cambiar de cama a un paciente 🔀',
        pasos: [
          '⚠️ NO uses este flujo para altas o egresos definitivos. Es solo para cuando el paciente cambia de cama (mismo o distinto subservicio).',
          'OPCIÓN 1: Toca el chip 🔀 directamente en la tarjeta del paciente ocupado (junto a 🍽️ 💊 📋 🪪).',
          'OPCIÓN 2: Si ya abriste el modal de Egreso por error, toca el botón verde arriba "🔀 ¿No es egreso? Trasladar / cambiar de cama".',
          'Se abre el modal con la lista de TODAS las camas disponibles del hospital, agrupadas por Servicio · Subservicio.',
          'Usa el buscador para filtrar por nombre de servicio, subservicio o número de cama.',
          'Toca la cama destino. Aparece un preview abajo que te dice cuál de los 2 escenarios se va a aplicar:',
          '   ✓ Cambio de cama en MISMO subservicio (ej. URG OBSERV cama 1 → URG OBSERV cama 3): solo cambia el cama_id del paciente. NO cuenta como egreso/ingreso.',
          '   🔀 Traslado entre subservicios (ej. URG CHOQUE → URG OBSERV, URG → UCI, HH1 → HM): cuenta como EGRESO del subservicio origen (con motivo TRASLADO, suma C04 en productividad) e INGRESO al subservicio destino (suma C02). Los datos del paciente (nombre, edad, sexo, CURP/fecha-nac, diagnóstico, especialidad, grupo sanguíneo, alergias, riesgos UPP/caídas) se copian automáticamente — no tienes que volver a capturarlos.',
          'Toca "🔀 Trasladar" o "✓ Cambiar de cama" según el caso. La operación es atómica.',
          'Quién puede trasladar: jefe, subjefe, supervisor y gestor del servicio. Las enfermeras de piso (modo lectura) no ven el chip.',
        ],
      },
      {
        titulo: '2.7. Imprimir la Tarjeta de Identificación 🪪 del paciente',
        pasos: [
          'En cualquier tarjeta de paciente ocupado, busca el chip 🪪 en la fila de chips junto a 🍽️ 💊 📋.',
          'Tócalo. Se abre una nueva pestaña con la Tarjeta de Identificación impresa al estilo del Benemérito Hospital General con Especialidades IMSS-Bienestar "Juan María de Salvatierra".',
          'Contenido auto-llenado desde BD:',
          '   • Nombre del paciente (letra grande)',
          '   • Cama (badge verde junto al nombre)',
          '   • Fecha de nacimiento (descompuesta automáticamente si la capturaste como tal, ej. 23 / MAYO / 1980)',
          '   • Edad, Sexo, Expediente o CURP, Grupo y RH',
          '   • Alergias (marca SI/NO y el texto)',
          '   • Riesgo de caída / UPP / Escala del dolor (círculos y barras marcadas)',
          'Botón 🖨️ Imprimir en la parte superior — la hoja sale tamaño CARTA HORIZONTAL ocupando toda la página.',
          'Las escalas se imprimen en blanco y negro para ahorrar tóner; solo se resalta la opción capturada.',
        ],
      },
    ],
  },

  // ============================================================
  // 3. HOJA DIETAS
  // ============================================================
  {
    key: 'dietas',
    numero: '3',
    titulo: 'Hoja Dietas',
    icono: '🍽️',
    subtitulo: 'Indicaciones nutricionales por paciente',
    color: '#5CAB34',
    contenido: [
      {
        titulo: '3.1. Capturar la dieta del paciente',
        pasos: [
          'En el servicio, toca la pestaña "🍽️ Dietas".',
          'Verás la lista de pacientes activos con su renglón para dieta.',
          'Selecciona el tipo de dieta del catálogo (Líquidos claros, Blanda, Hiposódica, etc.).',
          'Selecciona la consistencia (Normal, Picada, Pure, Líquida, etc.).',
          'Si la dieta es especial o requiere observación, anótalo en Notas.',
        ],
      },
      {
        titulo: '3.2. Modificar la dieta',
        pasos: [
          'Toca el campo que vas a cambiar (tipo, consistencia o notas).',
          'Modifica y guarda.',
          'El cambio queda registrado con tu nombre y la hora exacta.',
        ],
      },
      {
        titulo: '3.3. Imprimir la hoja de dietas del servicio',
        pasos: [
          'En la pestaña Dietas, busca el botón "🖨️ Imprimir".',
          'Se abre una vista lista para imprimir con todos los pacientes activos y su dieta indicada.',
        ],
      },
    ],
  },

  // ============================================================
  // 4. HOJA RECETARIO
  // ============================================================
  {
    key: 'recetario',
    numero: '4',
    titulo: 'Hoja Recetario',
    icono: '💊',
    subtitulo: 'Medicamentos indicados por paciente',
    color: '#7d5b2f',
    contenido: [
      {
        titulo: '4.1. Agregar un medicamento al paciente',
        pasos: [
          'Pestaña "💊 Recetario" → toca al paciente.',
          'Toca "+ Agregar medicamento".',
          'Empieza a escribir el nombre y aparecerán sugerencias del catálogo (594 medicamentos disponibles).',
          'Selecciona el medicamento de la lista.',
          'Captura: dosis, vía (oral, IV, IM, SC, etc.), frecuencia y duración.',
          'En las columnas SOLICITADA y DISPENSADA elige una cantidad de 0 a 6 (se ampliaron los niveles a 6).',
          'Toca "Guardar".',
        ],
      },
      {
        titulo: '4.2. Modificar o eliminar un medicamento',
        pasos: [
          'En la lista de medicamentos del paciente, toca el ✎ para editar o el ✕ para eliminar.',
          'Si modificas, confirma con ✓.',
          'Si eliminas, te pide confirmación antes de quitarlo.',
        ],
      },
      {
        titulo: '4.3. Imprimir el recetario del servicio',
        pasos: [
          'En la pestaña Recetario, toca "🖨️ Imprimir".',
          'Se genera la vista con todos los pacientes y sus medicamentos.',
        ],
      },
    ],
  },

  // ============================================================
  // 5. HOJA CONTROL
  // ============================================================
  {
    key: 'control',
    numero: '5',
    titulo: 'Hoja Control',
    icono: '📋',
    subtitulo: 'Eventos clínicos: sondas, accesos vasculares, curaciones, procedimientos',
    color: '#A32D2D',
    contenido: [
      {
        titulo: '5.1. Agregar un evento clínico al paciente',
        pasos: [
          'Pestaña "📋 Control" → toca al paciente.',
          'Toca "+ Nuevo evento".',
          'Selecciona el tipo de evento:',
          '   • Sondas (urinaria, gástrica, pleurostomía)',
          '   • Accesos vasculares: CVC, CVP, Línea Media (LM, nuevo), Catéter umbilical',
          '   • Oxigenoterapia (puntas, mascarilla, etc.)',
          '   • Dispositivos (ventilación mecánica, etc.)',
          '   • Curaciones (CVP, CVC, Línea Media, herida) y refijaciones (CVP, CVC, LM)',
          '   • Procedimientos invasivos',
          '   • Precauciones de aislamiento',
          'Captura los detalles del evento y toca "Guardar".',
          '⚡ AUTOMATIZACIÓN: al marcar el evento como Realizada, suma automáticamente en Productividad el indicador correspondiente (agregado + específico, considerando si el paciente es neonato o adulto).',
        ],
      },
      {
        titulo: '5.2. Marcar un evento como REALIZADO',
        pasos: [
          'Toca el evento en la tarjeta del paciente.',
          'Toca "⏱️ Ahora" para marcar la hora actual.',
          '(O cambia el estado a "Realizada" si fue en otro momento.)',
        ],
      },
      {
        titulo: '5.3. Editar fecha/hora de un evento ya registrado',
        pasos: [
          'Toca el ícono ✎ junto a la fecha del evento.',
          'Selecciona la fecha y hora correctas.',
          'Confirma con ✓.',
        ],
      },
      {
        titulo: '5.4. Retirar una sonda o acceso vascular',
        pasos: [
          'Cuando se retira el dispositivo, cambia el estado del evento a "Retirada".',
          'Esto registra automáticamente la fecha/hora de retiro.',
        ],
      },
      {
        titulo: '5.5. Cancelar un evento creado por error',
        pasos: [
          'Toca el ✕ del evento.',
          'Confirma la cancelación.',
          'Nota: el evento NO se borra del historial; solo queda marcado como "Cancelado".',
        ],
      },
      {
        titulo: '5.6. Riesgos (UPP / caídas)',
        pasos: [
          'En la tarjeta del paciente, hay campos para "Riesgo UPP" y "Riesgo Caídas".',
          'Selecciona el nivel: ALTO / MEDIANO / BAJO.',
          'Estos datos se imprimen en la Tarjeta de Identificación 🪪 con los círculos/barras marcados.',
          '⚡ La captura inicial se hace en el modal de Ingreso (Censo) y se reevalúa aquí en Control conforme avanza el paciente.',
        ],
      },
      {
        titulo: '5.7. Tarjeta de Identificación 🪪 (grupo, alergias, escala del dolor)',
        pasos: [
          'En la tarjeta del paciente, sección morada "TARJETA DE IDENTIFICACIÓN".',
          'Aquí editas 3 campos que se imprimen en la ficha (🪪):',
          '   • Grupo y RH (O+, A-, AB+, etc.). Si lo capturaste al ingreso, ya viene puesto.',
          '   • Alergias (texto libre). Si está en blanco la ficha imprime "NO". Si escribes algo, imprime "SI" y el texto.',
          '   • Escala del dolor (0–10). Al cambiarla se guarda automáticamente la hora de evaluación.',
          'Todos estos datos se imprimen instantáneamente en la Tarjeta de Identificación 🪪 desde la pestaña Censo.',
        ],
      },
    ],
  },

  // ============================================================
  // 6. HOJA PRODUCTIVIDAD
  // ============================================================
  {
    key: 'productividad',
    numero: '6',
    titulo: 'Hoja Productividad',
    icono: '📊',
    subtitulo: 'Bitácora de 73 indicadores oficiales IMSS-Bienestar por día y turno',
    color: '#5978BB',
    contenido: [
      {
        titulo: '6.1. Para qué sirve esta hoja',
        pasos: [
          'Es la bitácora oficial de productividad de enfermería del servicio.',
          'Cada celda representa la productividad de un indicador en un día específico y un turno específico (Matutino / Vespertino / Nocturno).',
          'Estos datos alimentan los reportes mensuales que se entregan a la institución (IMSS-Bienestar).',
          'Llenado incompleto = reporte mensual incompleto = se pierde el registro institucional del trabajo realizado en el servicio.',
        ],
      },
      {
        titulo: '6.2. Las 5 categorías de captura (leyenda de colores)',
        pasos: [
          'Cada celda se llena por uno de 5 mecanismos. El color te dice cuál:',
          '🟢 AUTO-INGRESO (verde) — se llena sola al ingresar un paciente. Ej: "Ingresos" (C02), instalación de CVC al admitir, etc.',
          '🔵 AUTO-TURNO (azul) — se llena sola al iniciar el turno con datos heredados del turno anterior. Ej: pacientes que se reciben (C01), pacientes con sondas, accesos vasculares activos.',
          '🟣 AUTO-EVENTO (morado) — se llena sola al marcar un evento clínico como "Realizada" en la Hoja Control. Ej: curaciones, procedimientos invasivos, retiro de sondas.',
          '🟠 AUTO-CONTINUIDAD (durazno/naranja claro) — se llena sola al cambiar de turno: si el paciente sigue con su sonda, su línea, etc., el sistema cuenta esa continuidad sin que tengas que recapturar.',
          '🟡 MANUAL (amarillo) — TÚ LAS LLENAS. Son las que NO puede deducir el sistema solo. Son aproximadamente 48 de los 81 indicadores.',
          '🟤 TOTAL (crema) — subtotales y totales del mes. Se calculan solos.',
        ],
      },
      {
        titulo: '6.3. Qué se llena solo (no hagas nada) — AMPLIADO',
        pasos: [
          'CENSO HOSPITALARIO: C01 (recibidos), C02 (ingresos), C03–C06 (egresos), C07 (entregados al siguiente turno), C08, % de ocupación.',
          'TERAPIA DE INFUSIÓN — INSTALACIONES: V01 (CVC), V05 (CVP neonatos), V09 (CVP adultos), V13 (línea media), V25 (catéter umbilical) — al marcar el evento de acceso vascular como Realizada en Control.',
          'TERAPIA DE INFUSIÓN — CURACIÓN Y REFIJACIÓN:',
          '   • V03 CVC curación, V04 CVC refijación',
          '   • V07 CVP NEONATOS refijación, V08 CVP NEONATOS curación',
          '   • V11 CVP ADULTO refijación, V12 CVP ADULTO curación',
          '   • V15 LÍNEA MEDIA curación, V16 LÍNEA MEDIA refijación',
          '   Se distingue neonato (edad=0 o subservicio UCIN) vs adulto automáticamente.',
          'AGREGADOS (cualquier tipo): AV1 accesos, SD1 sondas, DP1 dispositivos, OX1 oxígeno, CUR1 curaciones, PRC1 procedimientos, K06 higiene, K07 glucemia.',
          'AISLAMIENTO: K03 (Pacientes con aislamiento) — se suma al elegir tipo de aislamiento en el modal de ingreso o crear el evento en Control.',
          'HEMODIÁLISIS (solo HDL): P05 Diálisis Peritoneal y P06 Hemodiálisis — al ingresar paciente con tipo de terapia seleccionado.',
          'VENTILACIÓN: ventilación mecánica al iniciar.',
          'Continuidad de sondas y accesos: se hereda al siguiente turno automáticamente.',
        ],
      },
      {
        titulo: '6.4. Qué SIEMPRE tienes que llenar manualmente',
        pasos: [
          'TERAPIA DE INFUSIÓN: V02/V06/V10/V14/V18/V22 (pacientes con más de 2 punciones). V17/V19/V20/V21/V23/V24 (PICC USG y PICC percutánea — instalación, curación, refijación).',
          'VENTILACIÓN: P05 (diálisis), P06 (hemodiálisis), P07 (PRISMA / terapia de reemplazo).',
          'CIRUGÍA Y OBSTETRICIA: Q01 (quirúrgicos), Q02 (cesáreas), Q03 (partos), Q04 (IVE), Q05 (ILE), Q06.',
          'HERIDAS: H01–H05 (clínica de heridas, HAF, sutura, ostomizados).',
          'EVENTOS CRÍTICOS: E01–E05 (códigos hemorragia obstétrica, preeclampsia, infarto, PCR, muertes maternas).',
          'INDICADORES DE CALIDAD: K01 (caídas), K02 (UPP nuevas), K04 (REA), K05 (QAPE).',
          '💡 Las celdas que dejes EN BLANCO se toman como 0 automáticamente al sumar el mes. No tienes que escribir 0 explícitamente al cierre del día.',
        ],
      },
      {
        titulo: '6.5. Cómo capturar manualmente una celda',
        pasos: [
          'Pestaña "📊 Productividad" → selecciona el Mes y Año arriba a la derecha.',
          'Identifica la fila del indicador (ej. SD1 - Sondas cualquier tipo).',
          'Identifica la columna del día y turno (ej. D5 / M = día 5, turno matutino).',
          'Toca la celda amarilla.',
          'Captura el número (puede ser entero o decimal según el indicador).',
          'Toca fuera para guardar (se guarda solo).',
          'Si quieres corregir, vuelve a tocar y modifica.',
        ],
      },
      {
        titulo: '6.6. Cuándo llenarla (frecuencia recomendada)',
        pasos: [
          'IDEAL: al final de cada turno, antes de entregar al siguiente turno.',
          'MÍNIMO: al final del día (capturar los 3 turnos M/V/N de ese día).',
          'NO RECOMENDADO: dejar la captura para fin de mes — se acumula y se olvidan datos.',
          'La hoja queda abierta para todo el mes en curso; puedes regresar a corregir días anteriores.',
        ],
      },
      {
        titulo: '6.7. Importancia institucional',
        pasos: [
          'Estos 81 indicadores son los OFICIALES de IMSS-Bienestar para enfermería.',
          'Son la base del reporte mensual de productividad del servicio.',
          'Sin estos números: el servicio NO aparece con productividad ante coordinación → afecta plantillas, recursos, evaluación.',
          'Captura cuidadosa y oportuna = mejor representación del trabajo real del servicio.',
        ],
      },
      {
        titulo: '6.8. Resumen mensual e impresión',
        pasos: [
          'En la parte inferior de la Hoja Productividad hay un "Resumen mensual" con totales por indicador.',
          'Botón "🖨️ Imprimir" → genera el reporte oficial listo para entrega/archivo.',
          'Botón "📥 Exportar Excel" → archivo .xlsx con todas las celdas (útil para revisión).',
          'Botón "📄 PDF" → versión imprimible/compartible.',
        ],
      },
    ],
  },

  // ============================================================
  // 7. ASIGNACIÓN DE PACIENTES POR TURNO
  // ============================================================
  {
    key: 'asignacion',
    numero: '7',
    titulo: 'Asignación de pacientes por turno',
    icono: '👥',
    subtitulo: 'Cómo asignar pacientes al personal de enfermería',
    color: '#C39C59',
    contenido: [
      {
        titulo: '7.1. Asignar paciente a una enfermera del turno',
        pasos: [
          'En la Hoja Censo, toca el badge "Sin asignar" que aparece junto a la cama del paciente.',
          'Se abre el modal de asignación.',
          'Selecciona el turno (M / V / N) y la enfermera del catálogo.',
          'Confirma. La enfermera asignada podrá editar la Hoja Control de ese paciente durante su turno.',
        ],
      },
      {
        titulo: '7.2. Reasignar o quitar asignación',
        pasos: [
          'Toca el badge de la enfermera ya asignada.',
          'Selecciona otra enfermera o usa "Quitar asignación".',
          'El cambio se registra con tu nombre y hora.',
        ],
      },
      {
        titulo: '7.3. Continuidad entre turnos',
        pasos: [
          'Las sondas, accesos vasculares y precauciones de aislamiento se "heredan" automáticamente al siguiente turno.',
          'No necesitas re-capturarlos cada vez que cambia el turno.',
          'Solo tienes que actualizarlos si hubo un cambio real (retiro, cambio de sitio, etc.).',
        ],
      },
    ],
  },

  // ============================================================
  // 8. TABLERO GENERAL
  // ============================================================
  {
    key: 'tablero',
    numero: '8',
    titulo: 'Tablero general',
    icono: '📈',
    subtitulo: 'Vista consolidada del hospital o de un servicio',
    color: '#265C4E',
    contenido: [
      {
        titulo: '8.1. Acceder al Tablero',
        pasos: [
          'Desde la pantalla principal, toca el botón "📊 Tablero Maestro" en la barra superior.',
          'Lo ven: jefatura, subjefatura, supervisión y gestores (jefes de servicio). El personal de enfermería de piso no tiene este botón.',
          'Verás los KPIs del día: Camas totales, Ocupadas, Disponibles, % de ocupación.',
          'En URGENCIAS también aparece el KPI "Camillas/Sillas" con los espacios extra.',
        ],
      },
      {
        titulo: '8.2. Qué alcance ves según tu rol',
        pasos: [
          'Jefatura / Administrador y Subjefatura / Supervisión: ven TODOS los servicios del hospital.',
          'Gestor (jefe de servicio): ve SOLO su(s) servicio(s); todos los KPIs, el resumen ejecutivo y las gráficas quedan acotados a su scope.',
          'La sección 🩺 Hemodiálisis y Diálisis aparece para los administradores globales y para el gestor cuyo servicio incluya Hemodiálisis.',
          'La 🔍 Auditoría NO aparece para el gestor.',
        ],
      },
      {
        titulo: '8.3. Cambiar el periodo (Día / Semana / Mes)',
        pasos: [
          'En la parte superior del Tablero hay tabs para Día, Semana y Mes.',
          'Jefatura / Administrador y Gestor: disponen de las tres vistas (Día, Semana y Mes), con resumen ejecutivo mensual.',
          'Subjefatura y Supervisión: ven SOLO la vista del Día.',
          'Al cambiar el periodo, el resumen y la productividad se actualizan al instante.',
        ],
      },
      {
        titulo: '8.4. Exportar el reporte',
        pasos: [
          'El botón de exportación aparece únicamente en la vista de Mes.',
          'Jefatura / Administrador: "📊 Exportar Excel + PDF" → reporte hospitalario completo (hoja consolidada + 1 hoja por servicio) más la versión PDF imprimible.',
          '🆕 Gestor: "📊 Exportar Excel de mi servicio" → archivo .xlsx acotado EXCLUSIVAMENTE a su(s) servicio(s). El gestor no recibe el PDF hospitalario, para no exponer servicios ajenos a su scope.',
        ],
      },
    ],
  },

  // ============================================================
  // 9. CIERRE
  // ============================================================
  {
    key: 'cierre',
    numero: '9',
    titulo: 'Cerrar sesión y cambiar contraseña',
    icono: '🔐',
    subtitulo: 'Seguridad de tu cuenta',
    color: '#888780',
    contenido: [
      {
        titulo: '9.1. Cambiar tu contraseña',
        pasos: [
          'En la barra superior del Dashboard, toca "🔑 Contrasena".',
          'Captura tu contraseña actual.',
          'Define la nueva contraseña (mínimo 6 caracteres) y confírmala.',
          'Toca "Guardar nueva contraseña".',
          'La próxima vez que inicies sesión usa la nueva.',
        ],
      },
      {
        titulo: '9.2. Cerrar sesión',
        pasos: [
          'En la barra superior toca "Cerrar sesión".',
          'Si compartes el dispositivo con otro compañero, SIEMPRE cierra sesión antes de pasárselo.',
        ],
      },
      {
        titulo: '9.3. Recomendaciones de seguridad',
        pasos: [
          'Tu acceso es personal e intransferible.',
          'No compartas tu contraseña con nadie, ni siquiera con tu compañero de turno.',
          'Cambia tu contraseña inicial cuanto antes después de tu primer ingreso.',
          'Cada acción que realices en el sistema queda registrada con tu identidad y la hora exacta.',
        ],
      },
    ],
  },

  // ============================================================
  // 9.5 CHAT (lo puse antes de servicios especiales)
  // ============================================================
  // Renumeramos: el chat es la nueva sección 10, servicios especiales 11.
  // (Si llegas hasta aquí editando, considera renumerar los IDs key
  // para que no choquen).
  // ============================================================

  // ============================================================
  // 10. CHAT ENTRE SERVICIOS
  // ============================================================
  {
    key: 'chat',
    numero: '10',
    titulo: 'Chat entre servicios 💬',
    icono: '💬',
    subtitulo: 'Coordinación interna y comunicación con la jefatura en tiempo real',
    color: '#1F4E79',
    contenido: [
      {
        titulo: '10.1. Cómo abrir el chat',
        pasos: [
          'Entra a cualquier servicio.',
          'Verás un botón verde flotante 💬 en la esquina inferior derecha.',
          'Tócalo para abrir el panel de chat (queda como ventana flotante encima del censo).',
          'Vuelve a tocarlo (o el ✕ arriba a la derecha del panel) para cerrar.',
        ],
      },
      {
        titulo: '10.2. Dos pestañas de chat',
        pasos: [
          '🏥 [Tu servicio] — chat INTERNO del servicio. Solo lo ven y escriben los gestores asignados al servicio y los admins globales (jefe / subjefe / supervisor). Útil para coordinar entregas de turno, alertas, dudas dentro del equipo.',
          '🌐 Global / Jefatura — canal COMÚN del hospital. Todos los autenticados ven y escriben. La jefatura aparece con badge rojo "JEFE" para identificarla. Aquí van comunicados generales, escalamientos y anuncios.',
        ],
      },
      {
        titulo: '10.3. Cómo enviar un mensaje',
        pasos: [
          'Selecciona la pestaña (Tu servicio o Global).',
          'Escribe en el cuadro de texto abajo del panel.',
          'Toca el botón verde ➤ o presiona Enter para enviar.',
          'Shift+Enter agrega un salto de línea sin enviar.',
        ],
      },
      {
        titulo: '10.4. Mensajes no leídos',
        pasos: [
          'Si llegan mensajes con el panel cerrado, aparece un círculo rojo con el número de mensajes nuevos sobre el botón 💬.',
          'Si llegan mensajes en una pestaña distinta a la que tienes abierta, aparece un badge rojo pequeño sobre el nombre de esa pestaña con el conteo.',
          'Al abrir la pestaña los contadores se ponen en 0.',
        ],
      },
      {
        titulo: '10.5. Identificación de remitente',
        pasos: [
          'Cada mensaje muestra el nombre completo del remitente y un chip de rol:',
          '   • JEFE (rojo)',
          '   • SUBJEFE / SUPERV. (dorado)',
          '   • GESTOR (verde)',
          '   • ENF. (gris)',
          'Tus propios mensajes aparecen en burbuja verde a la derecha. Los demás en burbujas blancas a la izquierda. Igual que WhatsApp.',
        ],
      },
      {
        titulo: '10.6. Reglas importantes',
        pasos: [
          'Los mensajes no se editan después de enviar. Verifica antes de enviar.',
          'Si te equivocas, puedes "borrar" tu propio mensaje (soft delete). No aparece más en el chat pero queda en el historial de auditoría.',
          'Mantén un tono profesional: el canal global lo lee TODO el personal y la jefatura.',
          'Para temas confidenciales de un paciente, usa el canal del servicio, no el global.',
        ],
      },
    ],
  },

  // ============================================================
  // 11. SERVICIOS CON FLUJO ESPECIAL
  // ============================================================
  {
    key: 'servicios_especiales',
    numero: '11',
    titulo: 'Servicios con flujo especial',
    icono: '⚕️',
    subtitulo: 'URPA · HEMODIÁLISIS · HEMODINÁMICA — solo camillas no censables',
    color: '#7d5b2f',
    contenido: [
      {
        titulo: '11.1. Qué tienen en común',
        pasos: [
          'Estos 3 servicios tienen camillas (no censables). NO afectan el % de ocupación censable del hospital ni la cuenta total de camas.',
          'Tienen sus 5 pestañas estándar: Censo, Dietas, Recetario, Control y Productividad. Productividad propia separada de los demás.',
          'En el Dashboard aparecen al final, después de Oncología Pediátrica. La tarjeta muestra "X / Y camillas (no censable)" en vez del porcentaje.',
        ],
      },
      {
        titulo: '11.2. URPA — Unidad de Recuperación Post-Anestésica',
        pasos: [
          '10 camillas. Pacientes en recuperación post-anestésica después de un procedimiento quirúrgico.',
          'Flujo de ingreso normal (igual que urgencias / hospitalización).',
          'Cuando el paciente despierta y se traslada a su servicio definitivo, usa el chip 🔀 Trasladar para moverlo a su cama destino (con conteo correcto de egreso URPA + ingreso al destino).',
        ],
      },
      {
        titulo: '11.3. HEMODIÁLISIS — flujo más estricto (lee el instructivo del servicio)',
        pasos: [
          '3 camillas. Pacientes que reciben Terapia de Sustitución Renal (Hemodiálisis o Diálisis Peritoneal).',
          'Tiene 2 pestañas adicionales que NO aparecen en otros servicios: 🩺 Censo ERC (bitácora histórica) y 📖 Instructivo HDL (guía dedicada paso a paso).',
          'Al ingresar un paciente en HEMODIÁLISIS, el modal exige 3 campos OBLIGATORIOS: CURP completa de 18 caracteres, Fecha de nacimiento, y Tipo de terapia (Hemodiálisis / DPCA / DPA / DPI).',
          'El sistema sincroniza automáticamente: el ingreso queda en censo, se crea entrada en la bitácora Censo ERC y suma +1 al indicador correcto de Productividad (P06 Hemodiálisis o P05 Diálisis peritoneal).',
          'En el Tablero Maestro hay una sección dedicada "🩺 HEMODIÁLISIS Y DIÁLISIS" con KPIs históricos.',
          'Lee el 📖 Instructivo HDL dentro del propio servicio para el paso a paso completo.',
        ],
      },
      {
        titulo: '11.4. HEMODINÁMICA',
        pasos: [
          '1 camilla. Sala de procedimientos hemodinámicos (cateterismo cardíaco, angiografía, etc.).',
          'Flujo normal de ingreso/egreso. Productividad propia.',
        ],
      },
    ],
  },

  // ============================================================
  // 12. RECETA DE MEDICAMENTO CONTROLADO (gestor y arriba)
  // ============================================================
  {
    key: 'receta_controlada',
    numero: '12',
    titulo: 'Receta de Medicamento Controlado',
    icono: '💊',
    subtitulo: 'Cómo generar un vale para psicotrópicos y estupefacientes (Grupos I-V LGS)',
    color: '#A32D2D',
    roles: TODOS_GESTOR_ARRIBA,
    contenido: [
      {
        titulo: '12.1. ¿Cuándo usar este formato?',
        pasos: [
          'SOLO para medicamentos clasificados como controlados por la Ley General de Salud: Grupo I (estupefacientes/narcóticos como Morfina, Fentanilo, Buprenorfina, Codeína), Grupo II (psicotrópicos potentes como Ketamina), Grupo III (benzodiacepinas como Diazepam, Midazolam, Lorazepam, Clonazepam, Tramadol).',
          'Para medicamentos NO controlados usa el Recetario normal.',
        ],
      },
      {
        titulo: '12.2. Cómo crear el vale',
        pasos: [
          'Entra a tu servicio → pestaña 💊 Recetario.',
          'Toca el botón rojo "💊 Receta controlada" arriba a la derecha.',
          'Selecciona al paciente del listado del servicio. Sus datos (nombre, edad, sexo, NSS/expediente, dx, cama) se rellenan SOLOS — son SOLO LECTURA.',
          'Elige el medicamento del catálogo (solo aparecen los controlados clasificados por grupo I/II/III).',
          'Llena: Dosis, Vía (IV/oral/SC), Frecuencia (c/8h, una vez), Duración, Cantidad en número y cantidad en letra.',
          'Captura el médico prescriptor: Nombre completo, Cédula profesional y Especialidad (texto libre — el médico de turno varía).',
          'Tu nombre y matrícula aparecen automáticamente como personal de enfermería que solicita.',
          'Toca "💾 Guardar e imprimir".',
        ],
      },
      {
        titulo: '12.3. La impresión: DOBLE BOLETA por hoja',
        pasos: [
          'Cada hoja imprime DOS boletas idénticas separadas por una línea de corte punteada.',
          'BOLETA SUPERIOR — badge guinda "Original · Jefatura de Enfermería": se queda en archivo de Jefatura.',
          'BOLETA INFERIOR — badge dorado "Copia · Supervisión de Enfermería": se usa para canjear físicamente el medicamento.',
          'Llena AMBAS boletas con los mismos datos y firmas (médico, enfermera que solicita, supervisora que entrega).',
          'Corta por la línea punteada. Entrega la Copia en Supervisión.',
        ],
      },
      {
        titulo: '12.4. Folios automáticos',
        pasos: [
          'Folio de entrada: NNNN/YYYY (numeración anual). Se asigna al crear.',
          'Folio de salida: S-NNNN/YYYY. Se asigna automáticamente cuando la supervisión marca el vale como "canjeada".',
          'Ambos folios quedan registrados en la receta impresa y en el sistema (trazabilidad permanente).',
        ],
      },
      {
        titulo: '12.5. 🆕 Impresión: solo mientras está PENDIENTE',
        pasos: [
          'El gestor puede imprimir/reimprimir el vale SOLO mientras está en estado PENDIENTE.',
          'Una vez que Supervisión lo APRUEBA o lo CANJEA, el vale se "congela": el gestor ya solo ve una VISTA PREVIA de lectura (no vuelve a imprimir).',
          'Esto evita reimpresiones de vales ya autorizados o surtidos. Si necesitas una copia adicional después de aprobado, solicítala a supervisión/jefatura.',
        ],
      },
      {
        titulo: '12.6. 🆕 Editar o anular: exclusivo de jefatura/administrador',
        pasos: [
          'Corregir (editar) o ANULAR una receta controlada ya emitida es una acción reservada a la jefatura y al administrador del sistema.',
          'Gestores y enfermeras NO pueden editar ni anular vales: solo crearlos. Supervisión y subjefatura aprueban, rechazan y canjean, pero tampoco editan/anulan.',
          'La anulación queda registrada en el sistema (quién y cuándo) para mantener la trazabilidad.',
        ],
      },
    ],
  },

  // ============================================================
  // 13. CARPETA DE SUPERVISIÓN (subjefe/supervisor + jefe/admin)
  // ============================================================
  {
    key: 'carpeta_supervision',
    numero: '13',
    titulo: 'Carpeta de Supervisión',
    icono: '🗂️',
    subtitulo: 'Herramientas exclusivas para jefatura, subjefatura y supervisión',
    color: '#7d5b2f',
    roles: TODOS_GLOBAL,
    contenido: [
      {
        titulo: '13.1. ¿Cómo entro?',
        pasos: [
          'Subjefes y supervisores: botón "🗂️ Supervisión" directamente en el Dashboard.',
          'Jefatura y administrador del sistema: dentro del Tablero Maestro, botón "🗂️ Supervisión" en el header.',
          'Verás las tarjetas de herramientas: Bitácora de Supervisión · Fondo Fijo de Psicotrópicos · Tablero General · Auditoría.',
          '🆕 Además hay una tarjeta informativa "🆘 Gestor del cuidado — Emergente" con el instructivo para usar las cuentas comodín en caso de ausencia de un titular (ver 13.3).',
        ],
      },
      {
        titulo: '13.2. Qué puedes hacer en cada herramienta',
        pasos: [
          'Bitácora de Supervisión: concentrado diario de TODOS los vales controlados del hospital. Aprobar, rechazar (con motivo) o marcar como canjeados.',
          'Fondo Fijo de Psicotrópicos: ver inventario con fondo fijo (12 medicamentos institucionales), registrar entradas (Recibido) y salidas (Surtido) manuales. El stock se descuenta solo cuando un vale se marca como canjeado.',
          'Tablero General del Hospital: KPIs de ocupación, hemodiálisis, ERC. Vista del día solamente para subjefe/supervisor; vista completa Día/Semana/Mes para jefatura y administrador.',
          'Auditoría: quién hace qué cambios. Subjefes/supervisores ven solo HOY y SU TURNO ACTUAL; jefatura y administrador ven los últimos 30 días completos.',
        ],
      },
      {
        titulo: '13.3. 🆕 Gestor del cuidado — Emergente (cuentas comodín)',
        pasos: [
          '¿Para qué sirve? Cubrir la AUSENCIA de un titular (incapacidad, falta, etc.) sin perder la captura del servicio. Existe una cuenta comodín por turno: Matutino, Vespertino y Nocturno.',
          'Cada comodín es MULTISERVICIOS (ve los 15 servicios del catálogo) y tiene acceso 24/7, así que entra a cualquier hora sin la restricción de turno.',
          'El correo y la contraseña de estas cuentas los resguarda la subjefatura de enfermería (NO aparecen en el sistema por seguridad). Pídelos a la subjefatura cuando necesites activar una.',
          'ANTES de entregar el acceso a quien cubre: la subjefatura cambia el nombre de la cuenta del turno por el NOMBRE REAL de la persona, para que vales, recetas y capturas queden a su nombre.',
          'AL TERMINAR la cobertura: se regresa el nombre a "GESTOR EMERGENTE M/V/N" para dejar la cuenta lista para la próxima vez.',
          'Es una medida temporal de respaldo. Lo normal es que cada quien use su propia cuenta dentro de su turno.',
        ],
      },
    ],
  },

  // ============================================================
  // 14. BITÁCORA DE SUPERVISIÓN (subjefe/supervisor + jefe/admin)
  // ============================================================
  {
    key: 'bitacora_supervision',
    numero: '14',
    titulo: 'Bitácora de Supervisión — Vales Controlados',
    icono: '📋',
    subtitulo: 'Aprobar, rechazar y canjear vales generados por los gestores',
    color: '#0E6755',
    roles: TODOS_GLOBAL,
    contenido: [
      {
        titulo: '14.1. Vista general',
        pasos: [
          'Acceso: Carpeta de Supervisión → 📋 Bitácora de Supervisión.',
          'Verás los vales del día agrupados en 3 turnos: Matutino (07-13h), Vespertino (14-19h), Nocturno (20-06h, hora Mazatlán).',
          'Arriba: KPIs con conteo de pendientes / aprobadas / canjeadas / rechazadas.',
          'Filtros disponibles: fecha, servicio, estado.',
        ],
      },
      {
        titulo: '14.2. Flujo del vale',
        pasos: [
          'Estado 1 PENDIENTE: el gestor del servicio recién lo creó. Aparece en amarillo.',
          'Estado 2 APROBADA: tú das visto bueno con el botón "✓ Aprobar". Aparece en verde. Quedas registrada como supervisora que aprobó.',
          'Estado 3 CANJEADA: cuando el gestor recoge físicamente el medicamento, marcas "📦 Canjeada". Aparece en azul. Esto descuenta automáticamente del Fondo Fijo de Psicotrópicos.',
          'Estado RECHAZADA: si hay un error o problema, usa "✕ Rechazar" y el sistema te pide motivo obligatorio. El vale queda registrado pero invalidado.',
        ],
      },
      {
        titulo: '14.3. Exportar a Excel',
        pasos: [
          'Botón "📊 Exportar a Excel" descarga un archivo con: portada institucional + 3 hojas (una por turno).',
          'El formato es compatible con el control de psicotrópicos físico para archivar.',
        ],
      },
    ],
  },

  // ============================================================
  // 15. FONDO FIJO DE PSICOTRÓPICOS (subjefe/supervisor + jefe/admin)
  // ============================================================
  {
    key: 'stock_psicotropicos',
    numero: '15',
    titulo: 'Fondo Fijo de Psicotrópicos',
    icono: '💉',
    subtitulo: 'Inventario con fondo fijo, entradas y salidas',
    color: '#A32D2D',
    roles: TODOS_GLOBAL,
    contenido: [
      {
        titulo: '15.1. Vista del día',
        pasos: [
          'Acceso: Carpeta de Supervisión → 💊 Fondo Fijo de Psicotrópicos.',
          '12 medicamentos del fondo fijo institucional: Diazepam, Nalbufina, Buprenorfina, Haloperidol, Midazolam, Propofol, Fentanilo, Morfina, Flumazenil, Amitriptilina, Lorazepam, Clonazepam.',
          'Por cada medicamento ves: Unidad · Fondo fijo · Recibido · Utilizado y Vales por turno (M/V/N) · STOCK ACTUAL (con semáforo: verde >30%, amarillo <30%, rojo agotado).',
          'Abajo se autollena el detalle de vales del día (Folio, Folio salida, Paciente, Medicamento, Médico, Enfermero solicita, Supervisora, Estado).',
        ],
      },
      {
        titulo: '15.2. Registrar entradas y salidas manuales',
        pasos: [
          'Botón "+ Recibido" en cada renglón: registras lo que llega de farmacia (entrada que SUMA al stock).',
          'Botón "− Surtido" en cada renglón: registras lo que entregas a algo distinto de un canje normal (salida que RESTA del stock).',
          'Los UTILIZADOS por canje de vale se generan SOLOS — no necesitas registrarlos manualmente.',
        ],
      },
      {
        titulo: '15.3. Imprimir hoja del día',
        pasos: [
          'Botón "🖨️ Hoja del día" arriba a la derecha.',
          'Imprime la vista actual con stock, movimientos por turno y detalle de vales. Sirve como evidencia física para archivo.',
        ],
      },
    ],
  },

  // ============================================================
  // 16. BITÁCORA SEMANAL E HISTÓRICO (jefatura + administrador SOLO)
  // ============================================================
  {
    key: 'bitacora_semanal',
    numero: '16',
    titulo: 'Bitácora Semanal e Histórico de Psicotrópicos',
    icono: '📅',
    subtitulo: 'Hoja semanal estilo PDF + archivo histórico inmutable',
    color: '#7d5b2f',
    roles: ['jefe','subjefe','supervisor'],
    soloAdminSistema: true,
    contenido: [
      {
        titulo: '16.1. ¿Quién puede usar esto?',
        pasos: [
          'EXCLUSIVO para Manuel (jefe) y Stavros (subjefe administrador del sistema).',
          'Otros subjefes y supervisores ven SOLO la hoja del día. El histórico y la hoja semanal NO les aparecen.',
        ],
      },
      {
        titulo: '16.2. Cambiar de fecha (histórico)',
        pasos: [
          'En la página de Fondo Fijo de Psicotrópicos, el selector "Fecha" te permite navegar a cualquier día pasado.',
          'El sistema reconstruye el día a partir de los movimientos guardados.',
        ],
      },
      {
        titulo: '16.3. Imprimir hoja semanal (estilo PDF oficial)',
        pasos: [
          'Botón "📅 Imprimir Semana": abre una vista de impresión en oficio horizontal.',
          'Replica el formato exacto del PDF de Control de Medicamentos Psicotrópicos: 12 medicamentos × 7 días (Lun-Dom) × 3 turnos × 4 columnas (Surtido/Recibido/Utilizado/Vales).',
          'La sección inferior se autollena con el detalle de TODOS los vales canjeados de la semana.',
          'Folio semanal del documento: BIT-YYYY-Sxx.',
        ],
      },
      {
        titulo: '16.4. Archivo histórico (snapshots)',
        pasos: [
          'Cada vez que abres una fecha, el sistema guarda automáticamente un snapshot JSON inmutable para auditorías futuras.',
          'Botón "💾 Guardar histórico" fuerza un snapshot manual (sobreescribe si ya existía).',
          'Los snapshots se conservan permanentemente — nadie los puede borrar.',
        ],
      },
    ],
  },

  // ============================================================
  // 17. AUDITORÍA (subjefe/supervisor con vista limitada + jefe/admin completa)
  // ============================================================
  {
    key: 'auditoria',
    numero: '17',
    titulo: 'Auditoría — Quién hace qué cambios',
    icono: '🔍',
    subtitulo: 'Trazabilidad de cambios en el sistema',
    color: '#5a4a8a',
    roles: TODOS_GLOBAL,
    contenido: [
      {
        titulo: '17.1. Acceso',
        pasos: [
          'Subjefes y supervisores: Carpeta de Supervisión → 🔍 Auditoría.',
          'Jefatura y administrador: botón "🔍 Auditoría" directo en el Dashboard o desde la Carpeta.',
        ],
      },
      {
        titulo: '17.2. Vistas disponibles',
        pasos: [
          'Cronológico: timeline de cambios con quién/qué/cuándo. Filtrable por usuario, sección y operación.',
          'Por usuario: ranking de actividad por colaborador en últimos 30 días.',
          'Por sección: qué módulos del sistema se editan más (Censo, Control, Recetario, Dietas, etc.).',
          'Por paciente: buscar un paciente y ver todo su historial de cambios.',
        ],
      },
      {
        titulo: '17.3. Restricciones por rol',
        pasos: [
          'Subjefe y supervisor: ven SOLO los cambios del DÍA ACTUAL y de SU TURNO ACTUAL (M/V/N por hora Mazatlán). Se muestra un banner amarillo informando esta limitación.',
          'Jefatura (Manuel) y administrador del sistema (Stavros): ven los últimos 30 días completos sin restricción de turno.',
          'La RLS del backend enforza esto — no es solo UI.',
        ],
      },
    ],
  },

  // ============================================================
  // 18. PARA EL ADMINISTRADOR DEL SISTEMA (Stavros / Manuel)
  // ============================================================
  {
    key: 'admin_sistema',
    numero: '18',
    titulo: 'Para el Jefe y el Administrador del Sistema',
    icono: '🛡️',
    subtitulo: 'Privilegios exclusivos de jefatura y admin',
    color: '#000',
    roles: ['jefe'],
    soloAdminSistema: true,
    contenido: [
      {
        titulo: '18.1. Lo que SOLO tú puedes ver',
        pasos: [
          'Panel "🟢 En línea ahora" en el Dashboard: chips verdes con cada colaborador conectado en ese momento.',
          'Tablero Maestro con vista Día/Semana/Mes (otros admin globales solo ven Día).',
          'Auditoría histórica completa (últimos 30 días, todos los turnos).',
          'Hoja semanal de psicotrópicos + selector de fecha histórica + snapshots manuales.',
        ],
      },
      {
        titulo: '18.2. Dar de alta nuevos colaboradores',
        pasos: [
          'Comparte el link del formulario de alta: https://forms.gle/HrHZYuFYwuPuvb3t7',
          'Cada colaborador llena el form con: nombre, correo Gmail (será su usuario), matrícula, rol, turno, servicio.',
          'El subjefe administrador procesa las altas en Supabase y manda el WhatsApp con credenciales.',
          'Contraseña inicial estándar: CensoSalva2026! (o Salvatierra2026 sin signos si tienen problemas con el celular).',
        ],
      },
      {
        titulo: '18.3. Resetear contraseña de un colaborador',
        pasos: [
          'Si un colaborador olvida la contraseña y no recibe el correo de reset, contacta directamente a Stavros.',
          'Se le restablece directo en Supabase a una temporal y debe cambiarla al primer ingreso.',
        ],
      },
    ],
  },
];

export function Instructivo() {
  const navigate = useNavigate();
  const { perfil } = useAuth();

  // Filtra secciones según el rol y la flag es_admin_sistema del usuario.
  // - Si la sección no declara `roles`, todos la ven.
  // - Si declara `roles`, el usuario debe estar en esa lista.
  // - Si además declara `soloAdminSistema=true`, solo lo ven los que cumplen
  //   esJefeOAdmin(perfil) (jefe O es_admin_sistema).
  const seccionesFiltradas = useMemo(() => {
    if (!perfil) return [];
    return SECCIONES.filter(s => {
      if (s.roles && !s.roles.includes(perfil.rol)) return false;
      if (s.soloAdminSistema && !esJefeOAdmin(perfil)) return false;
      return true;
    });
  }, [perfil]);

  // Renumera (las secciones filtradas conservan su número original
  // del catálogo, pero mostramos también un índice consecutivo).
  return (
    <div style={contenedor} className="instructivo-page">
      {/* HEADER */}
      <header style={header} className="no-print">
        <button onClick={() => navigate('/')} style={botonVolver}>← Tablero</button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 220 }}>
          <h1 style={titulo}>📖 Instructivo del Sistema</h1>
          <div style={subtitulo}>
            {perfil ? `Personalizado para ${formatearTitulo(perfil)}` : 'Censo Salvatierra · IMSS-Bienestar BCS'}
          </div>
        </div>
        <button onClick={() => window.print()} style={botonImprimir}>🖨️ Imprimir</button>
      </header>

      {/* INTRO */}
      <div style={introContenedor} className="no-print">
        <p style={introTexto}>
          {perfil ? (
            <>
              Bienvenida/o, <strong>{perfil.nombre_completo}</strong>. Este instructivo está
              filtrado a las funciones que TÚ puedes usar según tu rol ({formatearTitulo(perfil)}).
              Otros colaboradores ven instrucciones diferentes según sus privilegios.
            </>
          ) : (
            'Guía paso a paso. Inicia sesión para ver el instructivo personalizado a tu rol.'
          )}
        </p>
      </div>

      {/* SECCIONES */}
      <main style={main}>
        {seccionesFiltradas.map(seccion => (
          <section key={seccion.key} style={seccionContenedor}>
            <div style={{ ...seccionHeader, background: seccion.color }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={numeroBadge}>{seccion.numero}</span>
                <h2 style={seccionTitulo}>
                  <span style={{ marginRight: 8 }}>{seccion.icono}</span>
                  {seccion.titulo}
                </h2>
              </div>
              <p style={seccionSubtitulo}>{seccion.subtitulo}</p>
            </div>

            <div style={seccionCuerpo}>
              {seccion.contenido.map((bloque, idx) => (
                <div key={idx} style={bloqueContenedor}>
                  {bloque.titulo && <h3 style={bloqueTitulo}>{bloque.titulo}</h3>}
                  <ol style={listaOl}>
                    {bloque.pasos.map((paso, i) => (
                      <li key={i} style={pasoItem}>{paso}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer style={footer}>
        <p>Benemérito Hospital General con Especialidades IMSS-Bienestar "Juan María de Salvatierra" · IMSS-Bienestar Baja California Sur</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>
          Dudas, sugerencias o problemas técnicos → contacta al subjefe de enfermería.
        </p>
      </footer>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .instructivo-page { background: white !important; }
          section { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// ESTILOS
// ============================================================
const COLOR_FONDO = '#F5F1E8';
const COLOR_DORADO = '#C39C59';
const COLOR_VERDE_IMSS = '#0E6755';
const COLOR_TEXTO = '#2C2A26';

const contenedor: React.CSSProperties = {
  minHeight: '100vh',
  background: COLOR_FONDO,
  paddingBottom: 40,
};

const header: React.CSSProperties = {
  background: '#FFFFFF',
  borderBottom: `3px solid ${COLOR_DORADO}`,
  padding: '14px 20px',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

const botonVolver: React.CSSProperties = {
  padding: '8px 14px',
  background: COLOR_VERDE_IMSS,
  color: COLOR_DORADO,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 500,
};

const botonImprimir: React.CSSProperties = {
  ...botonVolver,
  background: COLOR_DORADO,
  color: '#FFFFFF',
};

const titulo: React.CSSProperties = {
  margin: 0,
  fontSize: 19,
  color: COLOR_VERDE_IMSS,
  fontWeight: 600,
};

const subtitulo: React.CSSProperties = {
  fontSize: 11,
  color: '#665e51',
  marginTop: 2,
};

const introContenedor: React.CSSProperties = {
  maxWidth: 900,
  margin: '20px auto 0',
  padding: '0 20px',
};

const introTexto: React.CSSProperties = {
  fontSize: 13,
  color: COLOR_TEXTO,
  background: '#FFFFFF',
  border: `1px solid ${COLOR_DORADO}`,
  borderRadius: 6,
  padding: '12px 16px',
  lineHeight: 1.5,
  margin: 0,
};

const main: React.CSSProperties = {
  maxWidth: 900,
  margin: '0 auto',
  padding: '20px',
};

const seccionContenedor: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${COLOR_DORADO}`,
  borderRadius: 8,
  marginBottom: 20,
  overflow: 'hidden',
};

const seccionHeader: React.CSSProperties = {
  padding: '14px 20px',
  color: '#FFFFFF',
};

const numeroBadge: React.CSSProperties = {
  background: 'rgba(255,255,255,0.25)',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
};

const seccionTitulo: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
};

const seccionSubtitulo: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12,
  opacity: 0.9,
};

const seccionCuerpo: React.CSSProperties = {
  padding: '18px 24px',
};

const bloqueContenedor: React.CSSProperties = {
  marginBottom: 16,
};

const bloqueTitulo: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 14,
  color: COLOR_VERDE_IMSS,
  fontWeight: 600,
};

const listaOl: React.CSSProperties = {
  margin: 0,
  paddingLeft: 22,
};

const pasoItem: React.CSSProperties = {
  fontSize: 13,
  color: COLOR_TEXTO,
  lineHeight: 1.55,
  marginBottom: 4,
};

const footer: React.CSSProperties = {
  textAlign: 'center',
  padding: '20px',
  color: '#665e51',
  fontSize: 12,
};
