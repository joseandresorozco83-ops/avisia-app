# AVICIA — Simulador Interactivo de Asistencia Visual Inteligente

Prototipo web interactivo desarrollado en el marco de una investigación académica de la **Universidad Americana (UAM)** en **Managua, Nicaragua**, para demostrar conceptualmente cómo un sistema de inteligencia artificial puede interpretar información visual del entorno y comunicar mensajes auditivos comprensibles.

> **Advertencia:** Esta aplicación es un simulador conceptual para demostración académica. **No** debe utilizarse para navegación autónoma ni desplazamiento real en la vía pública.

## Requisitos previos

- Node.js 18+ (probado con v24.22.2)
- npm 9+ (probado con 11.19.1)

## Instalación y ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor de desarrollo
npm run dev

# 3. Compilar versión de producción
npm run build

# 4. Ejecutar pruebas automatizadas
npm test
```

## Funcionalidades principales

- **Modo A — Simulación guiada:** 5 escenarios urbanos de Managua (*Caminando por Managua*, *Esperando el autobús*, *Explorando un lugar*, *Detecciones múltiples* e *Información insuficiente*) con cajas delimitadoras animadas y comparación de políticas **C00** y **C01**.
- **Modo B — Laboratorio de visión artificial:** Carga de imágenes locales e inferencia en el navegador mediante `@mediapipe/tasks-vision` (`EfficientDet-Lite0`) con umbral de confianza ajustable. Si el modelo no está disponible o no hay conectividad para descargar sus pesos, informa «Integración pendiente» sin simular detecciones falsas.
- **Modo C — Cámara en vivo (experimental):** Acceso explícito mediante `MediaDevices.getUserMedia`, selector de cámara y liberación automática de recursos al detener o cambiar de modo.
- **Hablar con AVICIA:** Síntesis de voz en español (`Web Speech API`), reconocimiento de voz opcional con respaldo por texto y motor conversacional por intenciones.
- **Explorar Managua:** Mapa funcional con **Leaflet + OpenStreetMap** con ubicaciones y destinos demostrativos etiquetados como simulados.
- **Ver cómo piensa el sistema:** Visualización interactiva del flujo `Cámara → Reconocimiento visual → Confirmación → Selección del mensaje → Síntesis de voz`.
- **Demostración guiada (`INICIAR DEMOSTRACIÓN`):** Secuencia interactiva de 10 pasos con controles de pausa, avance, reinicio y salida.

