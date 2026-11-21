import type { Scenario } from '../types/avicia';

export const MANAGUA_SCENARIOS: Scenario[] = [
  {
    id: 'caminando-managua',
    number: 1,
    title: 'Caminando por Managua',
    subtitle: 'Tránsito urbano peatonal y vehicular',
    description:
      'Escena urbana representativa de Managua con una persona en la acera, un automóvil circulando, una motocicleta y referencia peatonal.',
    sceneType: 'walking_managua',
    defaultMessage: 'Identifico una persona y un automóvil en la escena.',
    location: {
      id: 'loc-uam-avenida',
      name: 'Cercanías de Universidad Americana (UAM) — Simulado',
      description: 'Tramo urbano simulado frente a acceso peatonal en Managua.',
      lat: 12.114993,
      lng: -86.236174,
      nearbyReferences: [
        'Campus UAM (referencia simulada)',
        'Acera peatonal norte (simulada)',
        'Parada de tránsito urbano (referencia demostrativa)',
      ],
      simulatedDestination: {
        name: 'Rotonda Rubén Darío (destino simulado)',
        lat: 12.1268,
        lng: -86.2636,
      },
    },
    steps: [
      {
        timeSec: 0,
        detections: [
          {
            id: 'det-p1',
            category: 'person',
            labelEs: 'Persona',
            source: 'simulated',
            bbox: { x: 18, y: 34, width: 15, height: 42 },
            confirmationStatus: 'confirmed',
            priority: 90,
            isNew: true,
          },
          {
            id: 'det-c1',
            category: 'car',
            labelEs: 'Automóvil',
            source: 'simulated',
            bbox: { x: 46, y: 45, width: 28, height: 24 },
            confirmationStatus: 'confirmed',
            priority: 80,
            isNew: true,
          },
          {
            id: 'det-m1',
            category: 'motorcycle',
            labelEs: 'Motocicleta',
            source: 'simulated',
            bbox: { x: 76, y: 52, width: 14, height: 18 },
            confirmationStatus: 'pending',
            priority: 75,
            isNew: true,
          },
          {
            id: 'det-s1',
            category: 'sidewalk',
            labelEs: 'Acera',
            source: 'simulated',
            bbox: { x: 5, y: 74, width: 90, height: 22 },
            confirmationStatus: 'confirmed',
            priority: 30,
            isNew: false,
          },
        ],
        c00Message: 'Persona y automóvil al frente.',
        c01Message: 'Persona y automóvil al frente.',
        c00Reason: 'Política C00: selecciona las primeras detecciones elegibles en orden de entrada (Persona, Automóvil).',
        c01Reason: 'Política C01: prioriza entidades de mayor relevancia urbana confirmadas (Persona, Automóvil) y mantiene en espera la motocicleta pendiente de confirmación.',
      },
      {
        timeSec: 4,
        detections: [
          {
            id: 'det-p1',
            category: 'person',
            labelEs: 'Persona',
            source: 'simulated',
            bbox: { x: 20, y: 34, width: 15, height: 42 },
            confirmationStatus: 'confirmed',
            priority: 90,
            isNew: false,
          },
          {
            id: 'det-c1',
            category: 'car',
            labelEs: 'Automóvil',
            source: 'simulated',
            bbox: { x: 42, y: 45, width: 28, height: 24 },
            confirmationStatus: 'confirmed',
            priority: 80,
            isNew: false,
          },
          {
            id: 'det-m1',
            category: 'motorcycle',
            labelEs: 'Motocicleta',
            source: 'simulated',
            bbox: { x: 70, y: 50, width: 15, height: 19 },
            confirmationStatus: 'confirmed',
            priority: 85,
            isNew: true,
          },
          {
            id: 'det-pole1',
            category: 'pole',
            labelEs: 'Poste en acera',
            source: 'simulated',
            bbox: { x: 38, y: 24, width: 9, height: 52 },
            confirmationStatus: 'confirmed',
            priority: 96,
            isNew: true,
            isInanimateObstacle: true,
            proximityZone: 'front_close',
          },
        ],
        c00Message: 'Persona, auto, moto y poste.',
        c01Message: 'Cuidado: poste frente a ti. Moto cerca.',
        c00Reason: 'Política C00: enumera todas las detecciones confirmadas actuales.',
        c01Reason: 'Política C01: prioriza la alerta de obstáculo inanimado frontal (Poste en acera) y anuncia la motocicleta confirmada.',
      },
    ],
    qaKnowledge: {
      whatIsInFront:
        'Frente a ti hay una persona sobre la acera, un automóvil y una motocicleta en movimiento.',
      hasBus: 'No se identifica ningún autobús en esta escena.',
      hasPeople: 'Sí, identifico una persona ubicada en el sector izquierdo de la escena.',
      whereAmI:
        'Te encuentras cerca de las inmediaciones de la Universidad Americana, UAM, en Managua.',
      whatNearby:
        'Cerca de ti hay una acera peatonal y referencias urbanas del entorno universitario.',
      detectionMeaning:
        'Las cajas delimitadoras representan objetos identificados en la escena junto con su estado de confirmación temporal antes de emitirse por voz.',
    },
  },
  {
    id: 'esperando-autobus',
    number: 2,
    title: 'Esperando el autobús',
    subtitle: 'Parada urbana y transporte colectivo',
    description:
      'Escena en parada urbana de Managua con autobús aproximándose, personas esperando y vehículos particulares.',
    sceneType: 'waiting_bus',
    defaultMessage: 'Identifico un autobús y varias personas.',
    location: {
      id: 'loc-parada-metrocentro',
      name: 'Parada simulada sector Metrocentro — Managua',
      description: 'Zona de espera de transporte colectivo (ubicación demostrativa).',
      lat: 12.1282,
      lng: -86.2631,
      nearbyReferences: [
        'Parada de autobús demostrativa',
        'Zona comercial Metrocentro (referencia simulada)',
        'Paso peatonal urbano (simulado)',
      ],
      simulatedDestination: {
        name: 'Plaza de la Revolución (destino simulado)',
        lat: 12.1559,
        lng: -86.2718,
      },
    },
    steps: [
      {
        timeSec: 0,
        detections: [
          {
            id: 'det-b1',
            category: 'bus',
            labelEs: 'Autobús',
            source: 'simulated',
            bbox: { x: 42, y: 26, width: 42, height: 38 },
            confirmationStatus: 'confirmed',
            priority: 98,
            isNew: true,
          },
          {
            id: 'det-p2',
            category: 'person',
            labelEs: 'Persona',
            source: 'simulated',
            bbox: { x: 14, y: 40, width: 11, height: 34 },
            confirmationStatus: 'confirmed',
            priority: 85,
            isNew: true,
          },
          {
            id: 'det-p3',
            category: 'person',
            labelEs: 'Persona',
            source: 'simulated',
            bbox: { x: 26, y: 42, width: 10, height: 32 },
            confirmationStatus: 'confirmed',
            priority: 85,
            isNew: true,
          },
          {
            id: 'det-stop',
            category: 'bus_stop',
            labelEs: 'Parada',
            source: 'simulated',
            bbox: { x: 8, y: 24, width: 22, height: 50 },
            confirmationStatus: 'confirmed',
            priority: 60,
            isNew: false,
          },
        ],
        c00Message: 'Autobús y personas en parada.',
        c01Message: 'Autobús y personas en parada.',
        c00Reason: 'Política C00: reporta los elementos elegibles detectados en la escena.',
        c01Reason: 'Política C01: agrupa el conteo de personas y prioriza el autobús por relevancia de movilidad.',
      },
    ],
    qaKnowledge: {
      whatIsInFront:
        'Se observan un autobús, varias personas esperando y una estructura de parada urbana.',
      hasBus: 'Sí, identifico un autobús en la escena.',
      hasPeople: 'Sí, identifico varias personas esperando en el área de la parada.',
      whereAmI:
        'Te encuentras en una parada del sector Metrocentro en Managua.',
      whatNearby:
        'Cerca de ti hay una parada de autobús y referencias comerciales del sector.',
      busRouteReply:
        'En esta demostración puedo identificar un autobús, pero no tengo información suficiente para confirmar su ruta.',
      detectionMeaning:
        'El detector reconoce la categoría visual «autobús», pero no realiza lectura de rótulos ni consulta de rutas en tiempo real en esta versión.',
    },
  },
  {
    id: 'explorando-lugar',
    number: 3,
    title: 'Explorando un lugar',
    subtitle: 'Referencia espacial y entorno urbano',
    description:
      'Escena de reconocimiento general en un punto de referencia de Managua con categorías visibles y contexto simulado.',
    sceneType: 'exploring_place',
    defaultMessage: 'Identifico edificaciones, acera y presencia de personas en el entorno.',
    location: {
      id: 'loc-puerto-salvador',
      name: 'Sector Puerto Salvador Allende / Malecón — Simulado',
      description: 'Entorno abierto de referencia cultural y peatonal en Managua (simulado).',
      lat: 12.1597,
      lng: -86.2692,
      nearbyReferences: [
        'Área peatonal del malecón (simulada)',
        'Edificaciones de referencia urbana (simuladas)',
        'Acceso vehicular cercano (simulado)',
      ],
      simulatedDestination: {
        name: 'Antigua Catedral de Managua (referencia simulada)',
        lat: 12.1554,
        lng: -86.2712,
      },
    },
    steps: [
      {
        timeSec: 0,
        detections: [
          {
            id: 'det-ed1',
            category: 'building',
            labelEs: 'Edificio',
            source: 'simulated',
            bbox: { x: 52, y: 14, width: 38, height: 48 },
            confirmationStatus: 'confirmed',
            priority: 65,
            isNew: true,
          },
          {
            id: 'det-p4',
            category: 'person',
            labelEs: 'Persona',
            source: 'simulated',
            bbox: { x: 28, y: 44, width: 12, height: 34 },
            confirmationStatus: 'confirmed',
            priority: 85,
            isNew: true,
          },
          {
            id: 'det-s2',
            category: 'sidewalk',
            labelEs: 'Acera',
            source: 'simulated',
            bbox: { x: 6, y: 74, width: 88, height: 22 },
            confirmationStatus: 'confirmed',
            priority: 40,
            isNew: false,
          },
        ],
        c00Message: 'Edificio, persona y acera.',
        c01Message: 'Persona al frente. Acera despejada.',
        c00Reason: 'Política C00: ordena los elementos detectados según aparición en el registro.',
        c01Reason: 'Política C01: prioriza la presencia humana y sintetiza las referencias espaciales del entorno.',
      },
    ],
    qaKnowledge: {
      whatIsInFront:
        'Hay edificaciones urbanas, una acera amplia y una persona caminando.',
      hasBus: 'No se identifica ningún autobús en este entorno.',
      hasPeople: 'Sí, se identifica una persona en el área peatonal.',
      whereAmI:
        'Te encuentras en el sector del Puerto Salvador Allende y el Malecón de Managua.',
      whatNearby:
        'En tu entorno cercano hay áreas peatonales, edificaciones urbanas y cercanía a la Plaza de la Revolución.',
      detectionMeaning:
        'La descripción combina categorías visuales generales con referencias espaciales del entorno urbano.',
    },
  },
  {
    id: 'detecciones-multiples',
    number: 4,
    title: 'Detecciones múltiples',
    subtitle: 'Comparación de políticas C00 vs C01',
    description:
      'Escena con múltiples objetos simultáneos para observar cómo se filtran, confirman y priorizan los mensajes bajo las políticas C00 y C01.',
    sceneType: 'multiple_detections',
    defaultMessage: 'Múltiples objetos detectados; cambia entre C00 y C01 para comparar el criterio.',
    location: {
      id: 'loc-rotonda-ruben',
      name: 'Intersección Rotonda Rubén Darío — Simulado',
      description: 'Cruce urbano de alta densidad vehicular (escenario simulado).',
      lat: 12.1268,
      lng: -86.2636,
      nearbyReferences: [
        'Cruce vehicular simulado',
        'Isla peatonal de referencia (simulada)',
      ],
    },
    steps: [
      {
        timeSec: 0,
        detections: [
          {
            id: 'det-s3',
            category: 'sidewalk',
            labelEs: 'Acera',
            source: 'simulated',
            bbox: { x: 4, y: 76, width: 92, height: 18 },
            confirmationStatus: 'confirmed',
            priority: 25,
            isNew: false,
          },
          {
            id: 'det-c2',
            category: 'car',
            labelEs: 'Automóvil',
            source: 'simulated',
            bbox: { x: 16, y: 46, width: 24, height: 22 },
            confirmationStatus: 'confirmed',
            priority: 75,
            isNew: true,
          },
          {
            id: 'det-m2',
            category: 'motorcycle',
            labelEs: 'Motocicleta',
            source: 'simulated',
            bbox: { x: 43, y: 50, width: 13, height: 19 },
            confirmationStatus: 'pending',
            priority: 82,
            isNew: true,
          },
          {
            id: 'det-b2',
            category: 'bus',
            labelEs: 'Autobús',
            source: 'simulated',
            bbox: { x: 58, y: 26, width: 32, height: 36 },
            confirmationStatus: 'confirmed',
            priority: 95,
            isNew: true,
          },
          {
            id: 'det-p5',
            category: 'person',
            labelEs: 'Persona',
            source: 'simulated',
            bbox: { x: 6, y: 38, width: 10, height: 34 },
            confirmationStatus: 'confirmed',
            priority: 90,
            isNew: true,
          },
        ],
        c00Message: 'Acera, auto, moto, autobús y persona.',
        c01Message: 'Autobús y persona al frente.',
        c00Reason: 'Política C00 (orden de llegada/elegibilidad): incluye cada detección elegible conforme aparece, sin agrupar por novedad ni esperar confirmación completa.',
        c01Reason: 'Política C01 (preferencia, novedad y cambio confirmado): filtra la motocicleta aún pendiente y destaca los elementos confirmados de mayor prioridad (Autobús, Persona) evitando saturar la locución.',
      },
    ],
    qaKnowledge: {
      whatIsInFront:
        'Hay múltiples elementos simultáneos: autobús, automóvil, persona, acera y una motocicleta en proceso de confirmación.',
      hasBus: 'Sí, hay un autobús confirmado en el lado derecho de la escena.',
      hasPeople: 'Sí, hay una persona identificada en el borde izquierdo.',
      whereAmI:
        'Te encuentras en una intersección cercana a la Rotonda Rubén Darío en Managua.',
      whatNearby:
        'Cerca de ti hay un cruce vehicular y un paso peatonal.',
      busRouteReply:
        'En esta demostración puedo identificar un autobús, pero no tengo información suficiente para confirmar su ruta.',
      detectionMeaning:
        'Este escenario permite comparar dos reglas de selección de mensajes (C00 y C01) sin declarar una superioridad absoluta sin validación experimental.',
    },
  },
  {
    id: 'informacion-insuficiente',
    number: 5,
    title: 'Información insuficiente',
    subtitle: 'Límites del sistema y manejo de incertidumbre',
    description:
      'Escena con baja visibilidad o evidencia ambigua para demostrar que AVISIA comunica sus limitaciones en lugar de inventar detecciones.',
    sceneType: 'insufficient_info',
    insufficientEvidence: true,
    defaultMessage: 'No tengo información suficiente para describir con confianza esta escena.',
    location: {
      id: 'loc-indefinida',
      name: 'Ubicación simulada con visibilidad reducida',
      description: 'Escenario diseñado para validar el manejo responsable de incertidumbre.',
      lat: 12.1364,
      lng: -86.2514,
      nearbyReferences: ['Sin referencias visuales confiables en este cuadro'],
    },
    steps: [
      {
        timeSec: 0,
        detections: [
          {
            id: 'det-unk1',
            category: 'unknown',
            labelEs: 'Silueta sin confirmar',
            source: 'simulated',
            bbox: { x: 35, y: 36, width: 28, height: 34 },
            confirmationStatus: 'insufficient',
            priority: 10,
            isNew: false,
          },
        ],
        c00Message: 'No tengo información suficiente para describir con confianza esta escena.',
        c01Message: 'No tengo información suficiente para describir con confianza esta escena.',
        c00Reason: 'Ninguna detección alcanza el umbral de elegibilidad requerido.',
        c01Reason: 'Política C01: bloquea mensajes especulativos cuando la evidencia visual es insuficiente o no está confirmada.',
      },
    ],
    qaKnowledge: {
      whatIsInFront:
        'No tengo información suficiente para describir con confianza esta escena.',
      hasBus:
        'No tengo información suficiente para confirmar si hay un autobús en esta escena.',
      hasPeople:
        'No tengo información suficiente para confirmar la presencia de personas.',
      whereAmI:
        'La visibilidad actual es muy reducida y no es posible confirmar referencias de ubicación.',
      whatNearby:
        'No hay referencias visuales confirmadas en este escenario.',
      detectionMeaning:
        'Cuando la señal visual es ambigua o no supera el umbral de confirmación, AVISIA evita adivinar objetos para no inducir a error.',
    },
  },
];

