# SIMULATION.md — Componentes Simulados y Límites del Prototipo

AVICIA distingue explícitamente entre funcionalidades implementadas, funcionalidades simuladas y capacidades planificadas para futuras etapas de investigación.

## 1. Qué es Simulado en esta Versión

- **Escenarios del Modo A (Simulación Guiada):**
  - Las escenas urbanas (*Caminando por Managua*, *Esperando el autobús*, *Explorando un lugar*, *Detecciones múltiples*, *Información insuficiente*) utilizan ilustraciones vectoriales SVG etiquetadas explícitamente como **«Escena ilustrativa simulada»**.
  - Las cajas delimitadoras y estados de confirmación en Modo A provienen de datos preparados (`src/scenarios/managuaScenarios.ts`), **no** de un modelo de visión ejecutándose sobre fotografías. Por ello no muestran porcentajes falsos de confianza.
- **Ubicaciones y Destinos en Managua (`Explorar Managua`):**
  - El mapa usa cartografía real de OpenStreetMap, pero la posición actual del usuario, referencias cercanas y destinos pertenecen a escenarios demostrativos etiquetados como simulados.
- **Asistente Conversacional (`Hablar con AVICIA`):**
  - Opera mediante un motor determinista por intenciones (`ConversationService`) acotado al escenario o a las detecciones reales disponibles.

## 2. Qué es Real (Ejecutado en el Navegador)

- **Motor de Políticas C00 y C01 (`MessagePolicy`):** Lógica real de filtrado, priorización y supresión de mensajes repetidos.
- **Síntesis de Voz (`SpeechService`):** Audio real generado por la Web Speech API del navegador.
- **Laboratorio de Visión (`Modo B`):** Inferencia real en navegador mediante MediaPipe `EfficientDet-Lite0` cuando el entorno cuenta con conectividad para descargar el runtime WASM/TFLite. Si no está disponible, se muestra «Integración pendiente» sin simular cajas.
- **Cámara en Vivo (`Modo C`):** Flujo de video real mediante `getUserMedia` sujeto a permisos del usuario.

## 3. Límites Explícitos y Seguridad

- El sistema **no** confirma rutas ni números de autobuses en Managua.
- El sistema **no** evalúa si es seguro cruzar una calle ni reemplaza herramientas de orientación física (como el bastón blanco).
- Cuando la evidencia es insuficiente (Escenario 5), el sistema declara explícitamente su limitación.

