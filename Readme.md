# AV Content Planner - Marketing Team

Sistema integral de planificación y gestión de contenido audiovisual interno. Diseñado para centralizar el flujo de trabajo desde la concepción de la idea hasta el resultado final con sincronización en tiempo real.

## Características Principales
- **Sincronización Multi-dispositivo:** Gracias a Firebase Firestore, los cambios en PC se ven instantáneamente en el móvil.
- **Dashboard de Control:** Visualización de métricas de producción en tiempo real mediante gráficos dinámicos (Chart.js).
- **Gestión de Ideas:** Formulario avanzado para captura de ideas y opción de **eliminación** con un solo clic.
- **Auto-Siembra (Self-healing):** El sistema restaura automáticamente las 7 ideas maestras originales si detecta que faltan.
- **Vista de Detalle 360°:** Editor de guion en tiempo real, storyboard interactivo y seguimiento de producción.

## Stack Tecnológico
- **Frontend:** HTML5, Tailwind CSS, Vite.
- **Base de Datos:** Firebase Firestore (Real-time).
- **Autenticación:** Firebase Anonymous Auth.
- **Despliegue:** Vercel / GitHub Pages.

## Configuración de Entorno (Vercel)
Para que la sincronización funcione, debes configurar las siguientes variables de entorno en Vercel:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_APP_ID`: Identificador de "habitación" (ej: `av-planner-orpin`).

## Instrucciones de Desarrollo
1. Clona el repositorio.
2. Crea un archivo `.env` local con tus credenciales.
3. Ejecuta `npm install` y `npm run dev`.
4. Los cambios pusheados a `main` se despliegan automáticamente en Vercel.

## Reglas de Diseño
- Estética **Bento Box / Material Design 3**.
- Uso de iconos Unicode (sin dependencias externas).
- Arquitectura SPA optimizada para rendimiento.
