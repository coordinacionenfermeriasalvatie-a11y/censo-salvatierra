# Censo Salvatierra

Sistema de censo hospitalario para el Hospital General con Especialidades
"Juan María de Salvatierra" - IMSS Bienestar - La Paz, Baja California Sur.

## Características

- 10 servicios, 20 subservicios, 200 camas
- Captura de pacientes con sellado inmutable
- Auditoría automática de cambios
- Histórico permanente al egresar
- Login con autenticación segura (Supabase Auth)
- Roles: subjefe, supervisor, gestor, enfermera
- Identidad visual institucional IMSS Bienestar + Hospital Salvatierra

## Stack técnico

- **Frontend**: React 18 + TypeScript + Vite + PWA
- **Backend**: Supabase (PostgreSQL + Auth + Row Level Security)
- **Hosting**: Vercel (gratuito)
- **Costo mensual**: $0 USD

## Cómo empezar

Lee la **[GUÍA DE INSTALACIÓN](./GUIA_INSTALACION.md)** paso a paso.

## Estructura del proyecto

```
censo-salvatierra/
├── public/
│   └── logos/                  Logos institucionales sin modificar
│       ├── imss_bienestar.png
│       └── LOGO_HOSPITAL.jpg
├── src/
│   ├── pages/                  Pantallas principales
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   └── VistaServicio.tsx
│   ├── hooks/
│   │   └── useAuth.ts
│   ├── lib/
│   │   └── supabase.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   └── 01_schema.sql           Esquema completo de la base de datos
├── .env.example                Plantilla de variables de entorno
├── package.json
└── vite.config.ts
```

## Fases del proyecto

- [x] **Fase 1** - Fundación: login, dashboard, 200 camas, autenticación
- [ ] **Fase 2** - Captura de pacientes (ingresos, egresos, control, dietas, recetario)
- [ ] **Fase 3** - Productividad e indicadores REA/QAPE por turno
- [ ] **Fase 4** - Tablero consolidado, gráficas, exportación PDF/Excel
- [ ] **Fase 5** - Despliegue en Vercel para uso institucional

## Licencia

Proyecto institucional. Uso exclusivo para el Hospital General con
Especialidades "Juan María de Salvatierra" - IMSS Bienestar.
