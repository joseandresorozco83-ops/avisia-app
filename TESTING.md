# TESTING.md — Pruebas Ejecutadas y Resultados

Este documento registra únicamente las pruebas realmente ejecutadas tras la última edición del código.

## 1. Compilación TypeScript y Empaquetado (Vite)

- **Comando:** `npm run build` (`tsc -b && vite build`)
- **Resultado:** Exitoso (código de salida `0`).
- **Detalle observado:**
  - `tsc -b` validó todo el proyecto en modo estricto sin errores de tipos.
  - `vite build` generó el bundle de producción en `dist/` (`1594` módulos transformados en `14.38s`).

## 2. Pruebas Unitarias Automatizadas (Vitest)

- **Comando:** `npm test` (`vitest run`)
- **Archivo:** `src/services/__tests__/avicia.test.ts`
- **Resultado:** **5 de 5 pruebas aprobadas** (`Test Files: 1 passed (1)`, `Tests: 5 passed (5)`).
- **Casos verificados:**
  1. Carga correcta de los 5 escenarios de Managua y bandera de evidencia insuficiente en el Escenario 5.
  2. Diferenciación de evaluación entre políticas **C00** y **C01** en el escenario de detecciones múltiples.
  3. Supresión de mensajes duplicados dentro de la ventana temporal de repetición.
  4. Restricciones de seguridad en `ConversationService`: ante «¿Qué ruta es?» no inventa rutas de autobús, y ante «¿Puedo cruzar la calle?» emite la advertencia de seguridad.
  5. Manejo de incertidumbre en el Escenario 5 sin alucinar objetos.

## 3. Pruebas Manuales en Navegador Pendientes

Las siguientes verificaciones interactivas en navegador quedan listas para ejecutarse durante la demostración en vivo (`npm run dev`):
- Verificación auditiva de voces en español instaladas en el sistema operativo anfitrión.
- Prueba de inferencia real en **Modo B** cargando fotografías locales con conectividad habilitada para WASM/TFLite de MediaPipe.
- Prueba de permisos y selección de cámara física en **Modo C**.

