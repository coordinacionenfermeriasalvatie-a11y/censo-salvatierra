# Guía de instalación - Censo Salvatierra

Esta guía te lleva paso a paso por todo lo que tienes que hacer para tener
la aplicación corriendo. Usa la cuenta institucional
**coordinacionenfermeriasalvatie@gmail.com** para todos los servicios.

Tiempo estimado: 45 minutos a 1 hora la primera vez.

---

## Paso 1: Instalar Node.js en tu computadora

Node.js es el motor que necesitas para correr el proyecto en desarrollo.
Es gratis y se instala una sola vez.

### En Windows
1. Ve a https://nodejs.org
2. Descarga la versión "LTS" (la que dice "Recomendada para la mayoría de usuarios")
3. Ejecuta el instalador, dale "Siguiente" a todo
4. Reinicia tu computadora cuando termine

### En Mac
1. Ve a https://nodejs.org
2. Descarga la versión LTS
3. Abre el archivo `.pkg` descargado y dale "Continuar" a todo
4. Reinicia la computadora

### Verificar instalación
Abre la terminal (en Windows: PowerShell; en Mac: Terminal) y escribe:
```
node --version
```
Debe responder algo como `v20.10.0` o similar. Si responde "comando no encontrado",
no se instaló bien y hay que repetir.

---

## Paso 2: Crear cuenta en Supabase

Supabase es donde va a vivir la base de datos del censo. Es gratis para siempre
con los límites que ya vimos (sobran para 200 camas).

1. Ve a https://supabase.com
2. Da clic en **"Start your project"** (arriba a la derecha)
3. Cuando te pida iniciar sesión, elige **"Continue with Google"**
4. Inicia sesión con **coordinacionenfermeriasalvatie@gmail.com**
5. Acepta los permisos que pida Supabase

### Crear el proyecto
1. Una vez dentro, da clic en **"New project"**
2. Llena los campos:
   - **Name**: `censo-salvatierra`
   - **Database Password**: Una contraseña fuerte (por ejemplo:
     `Salvatierra-2026-IMSS-Bienestar!`)
     IMPORTANTE: Anota esta contraseña en un lugar seguro, la vas a necesitar después
   - **Region**: `South America (São Paulo)` - es la más cercana a México
   - **Pricing Plan**: Free
3. Da clic en **"Create new project"**
4. Espera 2 o 3 minutos a que termine de crear el proyecto

### Cargar el esquema de la base de datos
1. En el menú izquierdo, busca el ícono **"SQL Editor"** (parece un papel con código)
2. Da clic en **"+ New query"**
3. Abre el archivo `supabase/01_schema.sql` que viene en el proyecto
4. Copia TODO su contenido (Ctrl+A y luego Ctrl+C)
5. Pégalo en el editor SQL de Supabase (Ctrl+V)
6. Da clic en el botón **"Run"** (arriba a la derecha, o presiona Ctrl+Enter)
7. Espera unos segundos. Debe decir "Success. No rows returned" abajo

Si dice algún error, copia el error y avísame para resolverlo.

### Copiar las credenciales de Supabase
1. En el menú izquierdo, busca **"Settings"** (ícono de engranaje)
2. Da clic en **"API"** (dentro de Settings)
3. Verás dos datos importantes que vas a copiar:
   - **Project URL**: algo como `https://abcdefgh.supabase.co`
   - **anon public**: una llave larga que empieza con `eyJ...`
4. Mantén esa pestaña abierta, las vas a usar en el paso 4

---

## Paso 3: Descargar el código del proyecto

Tienes dos opciones:

### Opción A: Descargar el ZIP directamente (más simple)
1. Descarga el archivo `censo-salvatierra.zip` que te entregué
2. Descomprímelo en una carpeta de tu computadora. Por ejemplo:
   - En Windows: `C:\Proyectos\censo-salvatierra`
   - En Mac: `~/Proyectos/censo-salvatierra`

### Opción B: Subirlo a GitHub primero (recomendado, para tenerlo respaldado)
1. Ve a https://github.com e inicia sesión con `coordinacionenfermeriasalvatie@gmail.com`
2. Si nunca has tenido GitHub, te va a pedir crear cuenta. Acepta.
3. Crea un repositorio nuevo:
   - Da clic en **"+ New repository"**
   - Name: `censo-salvatierra`
   - Description: `Sistema de censo hospitalario - Hospital Juan Maria de Salvatierra - IMSS Bienestar`
   - Privado (Private)
   - Da clic en **"Create repository"**
4. Sube el código siguiendo las instrucciones que aparecen
   (necesitas tener Git instalado: https://git-scm.com)

---

## Paso 4: Configurar el proyecto

1. Abre la carpeta del proyecto donde lo descomprimiste
2. Busca el archivo `.env.example` y duplícalo, renombrando la copia a `.env.local`
3. Abre `.env.local` con un editor de texto (Bloc de Notas, TextEdit o VS Code)
4. Reemplaza los valores con los que copiaste de Supabase en el paso 2:

```
VITE_SUPABASE_URL=https://tu-proyecto-real.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...la-llave-larga-que-copiaste
VITE_HOSPITAL_NOMBRE="Hospital General con Especialidades Juan Maria de Salvatierra"
VITE_HOSPITAL_CIUDAD="La Paz, Baja California Sur"
VITE_INSTITUCION="IMSS-Bienestar"
```

5. Guarda el archivo

IMPORTANTE: Este archivo `.env.local` NUNCA debe subirse a GitHub porque contiene
tus credenciales. Ya está en el `.gitignore` para evitarlo.

---

## Paso 5: Instalar las dependencias y correr el proyecto

1. Abre la terminal en la carpeta del proyecto:
   - En Windows: clic derecho en la carpeta, "Abrir en Terminal"
   - En Mac: arrastra la carpeta sobre el ícono de Terminal en el Dock
2. Escribe este comando y dale Enter:
   ```
   npm install
   ```
   Esto descarga todas las librerías necesarias. Tarda 2 o 3 minutos la primera vez.

3. Cuando termine, escribe:
   ```
   npm run dev
   ```
4. Verás un mensaje como:
   ```
   VITE v5.4.0  ready in 800 ms
   ➜  Local:   http://localhost:5173/
   ```
5. Abre Chrome o Edge y ve a `http://localhost:5173`
6. Deberías ver la pantalla de login con los logos del IMSS Bienestar y del hospital

---

## Paso 6: Crear tu primer usuario (tú mismo como subjefe)

Como la app pide login y aún no hay usuarios, hay que crear uno.

1. Vuelve a Supabase en tu navegador
2. En el menú izquierdo, busca **"Authentication"** (ícono de candado)
3. Da clic en **"Users"** y luego en **"Add user"** → **"Create new user"**
4. Llena:
   - Email: `coordinacionenfermeriasalvatie@gmail.com` (o tu correo personal,
     el que vayas a usar para entrar al sistema)
   - Password: La contraseña con la que vas a entrar a la app
   - Auto Confirm User: **Marca este checkbox** (para no tener que confirmar por correo)
5. Da clic en **"Create user"**
6. Copia el "User UID" que aparece (es un código largo)

### Crear tu perfil con rol de subjefe
1. Vuelve al **"SQL Editor"** en Supabase
2. Da clic en **"+ New query"**
3. Pega esto (reemplaza el UID con el que copiaste):

```sql
INSERT INTO perfiles (id, matricula, nombre_completo, rol, turno_principal, activo)
VALUES (
  'pega-aqui-el-user-uid-que-copiaste',
  '00000000',
  'Mtro. Stavros Ayala Alonso',
  'subjefe',
  'JORNADA',
  true
);
```

4. Cambia los valores por tus datos reales
5. Da clic en **"Run"**

---

## Paso 7: Probar que todo funciona

1. Vuelve a la app (`http://localhost:5173`)
2. Ingresa con el correo y contraseña que registraste en el paso 6
3. Si todo está bien, verás el tablero general con los 10 servicios y sus 200 camas vacías
4. Da clic en cualquier servicio (por ejemplo UCIA) y verás todas sus camas marcadas como "Disponible"

¡Listo! La Fase 1 está funcionando.

---

## Lo que viene después (Fases 2 a 5)

La app que tienes ahora ya:
- Tiene la base de datos completa con tus 200 camas exactas
- Tiene login con autenticación segura
- Muestra ocupación del hospital en tiempo real
- Tiene los logos institucionales sin modificar
- Aplica la inmutabilidad con Row Level Security

Pero todavía falta:
- **Fase 2**: Captura de pacientes (ingresos, egresos, formato control, dietas, recetario)
- **Fase 3**: Productividad por turno M/V/N e indicadores REA y QAPE
- **Fase 4**: Tablero consolidado con gráficas y exportación a PDF/Excel
- **Fase 5**: Despliegue público en Vercel para que las demás computadoras del
  hospital lo puedan usar entrando a una URL

Cuando termines de probar la Fase 1 y todo funcione, me avisas y construyo la Fase 2.

---

## Problemas comunes

**"npm: command not found"**: Node.js no se instaló bien. Repite el Paso 1.

**"Faltan variables VITE_SUPABASE_URL..."**: El archivo `.env.local` no existe
o tiene mal escritas las variables. Revísalo.

**"Credenciales incorrectas" al hacer login**: La contraseña no coincide con
la que registraste en Supabase. Puedes resetearla desde
Supabase > Authentication > Users.

**Las camas no aparecen**: Probablemente el SQL del esquema no se ejecutó
correctamente. Vuelve a Supabase > SQL Editor y corre el archivo
`supabase/01_schema.sql` otra vez.

---

## Ayuda

Si algo falla, copia el mensaje de error exacto que veas y me lo mandas
para resolverlo juntos.
