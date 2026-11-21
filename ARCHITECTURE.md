# ARCHITECTURE.md — Diseño Técnico de AVICIA

## Stack Tecnológico

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4, Lucide React.
- **Visión artificial:** `@mediapipe/tasks-vision` (`ObjectDetector` con `EfficientDet-Lite0`), arquitectura modular preparada para futuras integraciones (ej. ONNX Runtime Web).
- **Voz e interacción:** Web Speech API (`window.speechSynthesis` y `SpeechRecognition` / `webkitSpeechRecognition` con entrada alternativa por texto).
- **Cartografía:** Leaflet + OpenStreetMap.
- **Pruebas:** Vitest.

## Estructura del Proyecto

```text
src/
  components/
    GuidedDemoBanner.tsx       # Secuencia guiada de 10 pasos
    LiveCameraPanel.tsx        # Modo C: cámara en vivo (getUserMedia)
    ManaguaMapModal.tsx        # Módulo Explorar Managua (Leaflet)
    PipelineModal.tsx          # Flujo interactivo "Ver cómo piensa el sistema"
    ProcessingPanel.tsx        # Zona central: detecciones, C00/C01 y mensaje
    SimulatedSceneCanvas.tsx   # Escenas SVG ilustrativas y cajas animadas (Modo A)
    TechnicalDetailsModal.tsx  # Panel de detalles técnicos y madurez
    VisionLabPanel.tsx         # Modo B: carga de imagen e inferencia real
    VoiceAssistantPanel.tsx    # Zona derecha: Hablar con AVICIA
  scenarios/
    managuaScenarios.ts        # 5 escenarios preparados de Managua
  services/
    CameraService.ts           # Gestión de dispositivos y streams de video
    ConversationService.ts     # Motor conversacional basado en intenciones
    DetectorService.ts         # Envoltorio modular para MediaPipe EfficientDet-Lite0
    LocationService.ts         # Referencias geográficas demostrativas de Managua
    MessagePolicy.ts           # Políticas de selección C00 y C01 + antirepetición
    ScenarioManager.ts         # Carga y consulta de escenarios
    SimulationEngine.ts        # Materialización temporal de pasos simulados
    SpeechService.ts           # Síntesis y reconocimiento de voz en español
  types/
    avicia.ts                  # Interfaces TypeScript compartidas
```

## Principios de Diseño

1. **Separación de fuentes de detección:** El tipo `DetectionSource` (`simulated` | `real_image` | `real_video`) garantiza que las puntuaciones de confianza y etiquetas distingan entre datos preparados e inferencia real.
2. **Motor de mensajes desacoplado:** `MessagePolicy` evalúa tanto pasos simulados como detecciones reales sin acoplarse a la interfaz gráfica.
3. **Ejecución local sin backend obligatorio:** No requiere claves API ni servidores de pago para la demostración principal.

