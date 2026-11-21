# PROMPT MAESTRO — GOOGLE ANTIGRAVITY
## AVICIA — Simulador interactivo de asistencia visual inteligente

> **Uso:** Copia este documento como instrucción de trabajo en Google Antigravity y adjunta como referencias `EVOLUTIA_De_la_Imagen_a_la_Voz_Experiencia_Interactiva_Unificada_v8.html` y `AVICIA_EVOLUTIA_Guia_Rediseno_HTML_v01.md`.
>
> **Naturaleza del producto:** Aplicación web interactiva que simula el prototipo AVICIA; **no** una presentación HTML ni una aplicación validada para navegación autónoma.

---

## 1. TU ROL

Actúa como un equipo multidisciplinario especializado en:

- Desarrollo de aplicaciones web con React y TypeScript.
- Inteligencia artificial y visión por computadora.
- Diseño UX/UI accesible.
- Tecnologías de asistencia para personas ciegas o con baja visión.
- Interfaces de voz e interacción conversacional.
- Simulación de sistemas inteligentes.
- Diseño de experiencias interactivas para demostraciones académicas.

Tu misión es diseñar, desarrollar, ejecutar y validar una aplicación web completamente funcional que simule la experiencia de uso de AVICIA.

No debes limitarte a generar una maqueta, presentación, prototipo estático o conjunto de pantallas.

**Debes desarrollar una aplicación interactiva, visualmente atractiva y técnicamente coherente, que pueda ejecutarse en un navegador y permita demostrar el funcionamiento conceptual de AVICIA.**

## 2. CONTEXTO DEL PROYECTO

AVICIA es el nombre provisional de una propuesta de asistente con inteligencia artificial para apoyar la movilidad de personas ciegas o con baja visión en Managua, Nicaragua.

El proyecto forma parte de una investigación académica de la Universidad Americana (UAM).

La aplicación tiene como propósito transformar información visual del entorno en mensajes auditivos comprensibles y útiles.

La arquitectura propuesta contempla:

1. Captura de imágenes mediante cámara.
2. Reconocimiento de objetos mediante modelos de visión artificial.
3. Seguimiento y confirmación de detecciones.
4. Selección de información relevante.
5. Comunicación de mensajes mediante síntesis de voz.
6. Evolución futura hacia servicios de orientación, ubicación, lugares de interés y transporte de Managua.

La solución se encuentra en desarrollo experimental.

El simulador debe distinguir claramente entre:

- Funcionalidades reales implementadas.
- Funcionalidades simuladas.
- Capacidades conceptuales previstas para futuras versiones.

No atribuyas capacidades verificadas a componentes que todavía son propuestas.

## 3. DOCUMENTOS DE REFERENCIA

Analiza los siguientes archivos que proporcionaré al proyecto:

**Documento 1:** `EVOLUTIA_De_la_Imagen_a_la_Voz_Experiencia_Interactiva_Unificada_v8.html`

Utilízalo para comprender:

- El contexto de la investigación.
- El propósito social.
- El funcionamiento conceptual.
- La arquitectura propuesta.
- Los escenarios de utilización.
- Los componentes tecnológicos.
- El laboratorio visual.
- La evolución prevista hacia una guía de Managua.

**Documento 2:** `AVICIA_EVOLUTIA_Guia_Rediseno_HTML_v01.md`

Utilízalo para comprender:

- Las decisiones de diseño.
- La experiencia audiovisual deseada.
- Los escenarios demostrativos.
- La interacción entre cámara, reconocimiento y voz.
- Las capacidades futuras.
- La integración propuesta de dispositivos.
- La experiencia de usuario.

**IMPORTANTE:** Estos archivos son documentos de referencia, no plantillas que deban copiarse literalmente. No quiero que reproduzcas la presentación EVOLUTIA. Quiero una aplicación completamente nueva que simule AVICIA.

## 4. OBJETIVO PRINCIPAL

Desarrollar una aplicación web interactiva denominada provisionalmente **AVICIA — Simulador de Asistencia Visual Inteligente**.

La aplicación debe permitir que cualquier asistente del simposio experimente cómo un sistema de inteligencia artificial podría interpretar el entorno y comunicar información por voz.

La experiencia debe ser suficientemente realista para que el público comprenda:

- Qué observa la cámara.
- Qué objetos identifica la inteligencia artificial.
- Cómo se interpretan las detecciones.
- Cómo se seleccionan los mensajes.
- Qué información escucha la persona usuaria.
- Cómo podría solicitar información adicional.
- Cómo se integrarían futuras funciones de orientación en Managua.

La aplicación debe utilizar español como idioma principal.

## 5. ARQUITECTURA DE LA APLICACIÓN

Construye la solución utilizando preferentemente:

**Frontend:** React, TypeScript, Vite y Tailwind CSS.

**Visualización:** Canvas o SVG para las detecciones; animaciones CSS; Framer Motion o una alternativa compatible cuando aporte valor.

**Voz:** Web Speech API para síntesis de voz; SpeechRecognition cuando esté disponible; interfaz alternativa mediante texto cuando el reconocimiento de voz no esté disponible.

**Visión artificial:** arquitectura modular compatible con MediaPipe Tasks Vision; posibilidad de incorporar EfficientDet-Lite0; compatibilidad futura con ONNX Runtime Web.

**Mapas:** Leaflet con OpenStreetMap, u otra alternativa compatible; ubicaciones demostrativas de Managua; datos geográficos de prueba identificados expresamente como simulados.

**Persistencia:** configuración local del simulador; escenarios de demostración almacenados en archivos JSON.

No es necesario implementar una base de datos ni un backend para la primera versión. Prioriza una aplicación local, rápida, estable y que no requiera credenciales de servicios de pago. No solicites claves API para funcionalidades que puedan implementarse localmente.

## 6. EXPERIENCIA VISUAL

Quiero una interfaz moderna, con calidad de producto tecnológico. La apariencia debe inspirarse en una aplicación de asistencia inteligente, no en un panel administrativo.

**Diseño general:** fondo oscuro elegante, azul profundo, acentos turquesa/cian, indicadores verdes para estados correctos, amarillo/ámbar para advertencias, tipografía legible, paneles con profundidad moderada, animaciones suaves e iconografía consistente. Evita interfaces recargadas.

**En computadoras, tres zonas:**

**Zona izquierda — entorno observado:** escena visual amplia que represente lo que observa la cámara. Puede contener personas, automóviles, motocicletas, autobuses, aceras, edificios y objetos del entorno.

**Zona central — procesamiento inteligente:** detecciones e interpretación; objetos detectados, categoría, confianza únicamente si existe una detección real, estado de confirmación, selección del mensaje y flujo visual hacia la respuesta.

**Zona derecha — asistente de voz:** estado del asistente, mensaje comunicado, historial de interacción, botón para escuchar, botón para repetir, entrada de preguntas e indicador de voz activa.

En pantallas pequeñas, reorganiza los paneles manteniendo su utilidad.

## 7. MODOS DE FUNCIONAMIENTO

Implementa tres modos principales.

### MODO A — SIMULACIÓN GUIADA

Este será el modo prioritario para el simposio. No requiere utilizar cámara real ni cargar modelos de inteligencia artificial. Debe disponer de escenarios preparados.

**Escenario 1: Caminando por Managua**

Mostrar una escena urbana reconocible con persona, automóvil, motocicleta y acera. Simular reconocimiento con cajas delimitadoras animadas. Mensaje: «Identifico una persona y un automóvil en la escena». Permitir repetirlo.

**Escenario 2: Esperando el autobús**

Mostrar autobús, personas, vehículos y parada o referencia urbana. Mensaje: «Identifico un autobús y varias personas». Ante «¿Qué ruta es?», responder «En esta demostración puedo identificar un autobús, pero no tengo información suficiente para confirmar su ruta». No inventar números ni recorridos.

**Escenario 3: Explorando un lugar**

Mostrar un entorno de referencia de Managua. Describir categorías visibles. Si se pregunta por ubicación, usar únicamente datos preparados del escenario; indicar que la ubicación es simulada.

**Escenario 4: Detecciones múltiples**

Mostrar varios objetos simultáneos. Explicar cómo se selecciona el mensaje y permitir comparar políticas **C00** (orden de llegada o elegibilidad) y **C01** (preferencia, novedad y cambio confirmado). No declarar que una sea superior sin evidencia.

**Escenario 5: Información insuficiente**

Mostrar escena sin evidencia suficiente. Responder «No tengo información suficiente para describir con confianza esta escena». Enseñar que la aplicación reconoce sus limitaciones.

### MODO B — LABORATORIO DE VISIÓN ARTIFICIAL

Permitir cargar imágenes locales para demostrar reconocimiento mediante modelo en navegador.

Integrar EfficientDet-Lite0 con MediaPipe Tasks Vision si se dispone de recursos y se verifica su funcionamiento. Categorías de interés: persona, automóvil, motocicleta y autobús.

Al cargar imagen:

1. Mostrar imagen.
2. Ejecutar detector si está disponible.
3. Dibujar cajas de detección.
4. Mostrar categorías.
5. Mostrar puntuaciones **reales** del modelo.
6. Generar una descripción sencilla.
7. Permitir escucharla mediante síntesis de voz.

Agregar control de umbral de confianza. Si el modelo no está disponible, mostrar «Integración pendiente»; nunca presentar cajas simuladas como inferencias reales.

### MODO C — CÁMARA EN VIVO

Funcionalidad experimental sujeta a compatibilidad y permisos:

- Activar y desactivar cámara.
- Seleccionar cámara disponible.
- Visualizar video.
- Ejecutar detección cuando exista modelo compatible.
- Mostrar objetos y comunicar mensajes por voz.

Usar `MediaDevices.getUserMedia` con permiso explícito. Si aún no existe reconocimiento continuo, mostrar el video y explicar que ese componente está pendiente. Nunca superponer detecciones ficticias sobre video real sin etiquetarlas como simuladas. Liberar recursos al detener cámara y cancelar avisos al cambiar de modo.

## 8. MOTOR DE MENSAJES

Crear un módulo independiente que reciba detecciones y genere mensajes. Considerar categoría, confirmación temporal, novedad, prioridad configurada, tiempo transcurrido, vigencia del aviso y mensajes repetidos.

En simulación guiada usar eventos predeterminados; en reconocimiento real, resultados auténticos. Evitar repetir el mismo mensaje continuamente.

Permitir activar/silenciar voz, repetir último mensaje, cancelar locución, modificar velocidad y seleccionar una voz en español disponible.

## 9. ASISTENTE CONVERSACIONAL

Crear panel **Hablar con AVICIA**, con entrada por texto y voz opcional.

Implementar inicialmente un motor controlado por intenciones. Preguntas posibles:

- «¿Qué hay frente a mí?»
- «¿Ves algún autobús?»
- «¿Hay personas cerca?»
- «¿Puedes repetir?»
- «¿Dónde estoy?»
- «¿Qué objetos identificaste?»
- «¿Qué significa la detección?»

Responder exclusivamente según el escenario seleccionado o la información realmente disponible. No inventar objetos, ubicaciones ni distancias. No dar instrucciones para cruzar o desplazarse con seguridad basadas solo en detecciones visuales.

Dejar preparada una integración opcional con servicios conversacionales futuros, sin hacerla requisito para usar el simulador.

## 10. SIMULADOR DE MOVILIDAD EN MANAGUA

Crear módulo **Explorar Managua** para mostrar la evolución futura hacia asistencia contextual.

Integrar un mapa **real y funcional** de Managua: Leaflet y OpenStreetMap cuando haya conectividad. Ubicaciones y recorridos ficticios deben etiquetarse como simulados. Seleccionar lugares conocidos solo tras verificar sus ubicaciones.

Mostrar ubicación de escenario, destino, referencias cercanas, información disponible e interacción por voz.

Ejemplo:

- Usuario: «¿Dónde estoy?»
- AVICIA: «En este escenario de demostración te encuentras cerca de [lugar definido para la simulación]».
- Usuario: «¿Qué tengo cerca?»
- AVICIA: «Según la información preparada para este escenario, hay [referencias verificadas]».

Mostrar la advertencia **«Simulación conceptual. No utilizar para navegación real»**.

No afirmar que el sistema dispone de rutas de buses en tiempo real. Identificar reconocimiento de buses/rutas/paradas como capacidades futuras dependientes de datos verificados.

## 11. VISUALIZACIÓN DEL PROCESAMIENTO

Crear botón **Ver cómo piensa el sistema**.

Presentar flujo:

**CÁMARA → RECONOCIMIENTO VISUAL → CONFIRMACIÓN → SELECCIÓN DEL MENSAJE → SÍNTESIS DE VOZ**.

Representar nodos conectados por pulsos animados. Al seleccionar cada nodo, explicar su función con lenguaje sencillo. Permitir observar el flujo completo, diferenciando eventos simulados de detecciones reales.

## 12. EXPERIENCIA DE DEMOSTRACIÓN

Crear botón principal **INICIAR DEMOSTRACIÓN**.

Secuencia:

1. Mostrar AVICIA y su propósito.
2. Presentar escena urbana de Managua.
3. Activar visualmente captura.
4. Mostrar cajas de objetos.
5. Mostrar selección de detecciones.
6. Comunicar mensaje mediante voz.
7. Permitir pregunta del usuario.
8. Responder por voz.
9. Mostrar procesamiento interno.
10. Invitar a explorar más escenarios.

No debe depender de video pregrabado; sí puede emplear imágenes preparadas. Incluir controles iniciar, pausar, continuar, reiniciar y cambiar escenario. No reproducir audio automáticamente sin interacción explícita.

## 13. ACCESIBILIDAD

Implementar navegación por teclado, etiquetas accesibles, foco visible, compatibilidad básica con lectores de pantalla, controles grandes, contraste adecuado, mensajes auditivos, estados anunciables y respeto por movimiento reducido.

La experiencia visual está dirigida al público del simposio, pero la interacción accesible debe funcionar independientemente de animaciones y del uso del ratón.

## 14. PANEL DE INFORMACIÓN TÉCNICA

Crear panel opcional **Detalles técnicos** con arquitectura, tecnologías, modelos, modo de ejecución, estado de cámara, tiempos medidos reales cuando existan, detecciones, política de selección, síntesis de voz y distinción simulación/inferencia real.

Incluir **Estado del desarrollo**, clasificando cada elemento como:

- Implementado y probado.
- Implementado, pendiente de validación.
- Simulado.
- Planificado.

El panel debe ser secundario; la interfaz principal debe comprenderse sin conocimientos técnicos.

## 15. ESTRUCTURA RECOMENDADA

```text
src/
  components/
  pages/
  layouts/
  scenarios/
  services/
  hooks/
  types/
  assets/
  utils/
```

Servicios sugeridos:

- `SimulationEngine`
- `DetectorService`
- `CameraService`
- `MessagePolicy`
- `SpeechService`
- `ConversationService`
- `LocationService`
- `ScenarioManager`

Separar fuentes de detección: datos simulados, imagen real procesada y video real procesado. Definir interfaces TypeScript compartidas para detecciones, eventos y mensajes. Diseñar para reemplazar motor simulado por componentes reales sin rehacer interfaz.

## 16. RECURSOS VISUALES

Priorizar imágenes auténticas de Managua, especialmente calles, vehículos, personas y referencias urbanas. La panorámica de Managua presente en el material EVOLUTIA puede inspirar la pantalla inicial, pero el simulador debe centrarse en la perspectiva de la cámara del usuario.

No usar mapas vectoriales decorativos como sustitutos de cartografía funcional. Si no hay imágenes locales adecuadas, emplear escenas ilustrativas claramente etiquetadas. No presentar imágenes generadas como fotografías reales.

## 17. RESTRICCIONES

La aplicación no debe:

- Convertirse en otra presentación académica.
- Depender solo de animaciones decorativas.
- Inventar detecciones reales o puntuaciones medidas.
- Inventar rutas de autobuses.
- Afirmar que permite desplazarse de forma segura.
- Proporcionar instrucciones peligrosas de movilidad.
- Solicitar credenciales innecesarias.
- Requerir servicios de pago.
- Depender de servidor remoto para simulación básica.
- Mezclar capacidades implementadas y objetivos futuros.
- Requerir conexión permanente para escenarios locales.

Identificar claramente toda demostración conceptual.

## 18. PLAN DE DESARROLLO

**Fase 1 — Estructura:** crear React/TypeScript, estilos, rutas y componentes; construir interfaz principal.

**Fase 2 — Simulación:** escenarios preparados, eventos simulados, cajas y flujo visual.

**Fase 3 — Voz:** Web Speech API, historial, reproducción, repetición y cancelación.

**Fase 4 — Conversación:** preguntas por texto, voz opcional, respuestas vinculadas al escenario.

**Fase 5 — Managua:** mapa funcional, escenarios territoriales, referencias y destinos demostrativos.

**Fase 6 — Visión real:** integrar detector, cargar imágenes y validar inferencia; agregar cámara si es viable.

**Fase 7 — Validación:** pruebas funcionales, visuales y de accesibilidad; corregir errores y preparar exposición.

## 19. PRUEBAS OBLIGATORIAS

Antes de dar el trabajo por terminado:

1. Ejecutar el proyecto.
2. Verificar pantalla inicial.
3. Probar escenarios.
4. Comprobar cajas de detecciones.
5. Probar respuestas por voz.
6. Validar mensajes según escenario.
7. Probar preguntas del usuario.
8. Comprobar mapa.
9. Validar inicio, pausa y reinicio.
10. Probar navegación por teclado.
11. Revisar adaptación a resoluciones distintas.
12. Verificar compilación sin errores.
13. Verificar etiquetas de módulos simulados.
14. Revisar que no se atribuyan capacidades inexistentes.
15. Ejecutar demostración completa de inicio a fin.

**No afirmar que se realizó una prueba no ejecutada.**

## 20. RESULTADO ESPERADO

Entregar **AVICIA — Simulador de Asistencia Visual Inteligente**, aplicación web ejecutable con interfaz profesional, escenarios interactivos, visualización de objetos, procesamiento simulado, mensajes de voz, preguntas, mapa de Managua, panel técnico, modo de demostración y arquitectura extensible a visión real.

Documentar:

- `README.md`: instalación y ejecución.
- `ARCHITECTURE.md`: diseño técnico.
- `SIMULATION.md`: componentes simulados y límites.
- `TESTING.md`: pruebas realmente ejecutadas y resultados.

## 21. CRITERIO FINAL DE CALIDAD

La aplicación debe transmitir una experiencia convincente de asistencia visual **sin confundir simulación con validación real**. Debe ser comprensible para público no técnico, mostrar el propósito social y facilitar la evolución hacia una implementación auténtica.

**Instrucción de ejecución para Antigravity:**

1. Analiza ambos archivos adjuntos.
2. Presenta un plan técnico breve.
3. Implementa por fases, priorizando código ejecutable.
4. Ejecuta la aplicación y corrige errores comprobados.
5. Si una integración avanzada falla, conserva los módulos funcionales y documenta la limitación.

**Entrega mínima obligatoria:** una simulación guiada funcional con **al menos tres escenarios**, cajas de detección, respuestas habladas e interacción mediante texto.

**Meta final:** construir una base demostrativa que pueda evolucionar hacia una aplicación real de asistencia visual.
