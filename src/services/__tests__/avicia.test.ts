import { describe, it, expect, beforeEach } from 'vitest';
import { scenarioManager } from '../ScenarioManager';
import { MessagePolicy, formatDistanceSteps } from '../MessagePolicy';
import { conversationService } from '../ConversationService';
import { simulationEngine } from '../SimulationEngine';
import { TemporalTrackerService } from '../TemporalTrackerService';
import {
  CATEGORY_MAP,
  computeClockPosition,
  estimatePinholeMeters,
} from '../DetectorService';
import { assistiveVisionService } from '../AssistiveVisionService';
import { parseArchitecturalSegments } from '../ArchitecturalSegmenterService';
import {
  classifyDoorState,
  computeStixelCorridor,
  enrichDoorsWithDepth,
} from '../DoorAndStixelService';
import { APP_PRESETS, applyAppPreset } from '../AppPresets';
import {
  isBanknoteQuestion,
  NIO_DENOMINATIONS,
  parseBanknoteFromOcrText,
  parseCloudBanknoteReply,
  USD_DENOMINATIONS,
} from '../CurrencyRecognitionService';
import type { DepthGrid } from '../DepthModelService';
import type { Detection, StreetAssistFeatures } from '../../types/avicia';

describe('AVICIA Core Services', () => {
  let policyEngine: MessagePolicy;

  beforeEach(() => {
    policyEngine = new MessagePolicy();
  });

  it('loads all 5 Managua scenarios', () => {
    const scenarios = scenarioManager.getAllScenarios();
    expect(scenarios.length).toBe(5);
    expect(scenarios[0].title).toBe('Caminando por Managua');
    expect(scenarios[4].insufficientEvidence).toBe(true);
  });

  it('evaluates C00 vs C01 on multiple detections scenario', () => {
    const scenario = scenarioManager.getScenarioById('detecciones-multiples')!;
    const step = simulationEngine.getStepForTime(scenario, 0);
    const detections = simulationEngine.materializeStepDetections(step);

    const evalC00 = policyEngine.evaluateSimulatedStep(step, detections, 'C00', 1000);
    policyEngine.resetHistory();
    const evalC01 = policyEngine.evaluateSimulatedStep(step, detections, 'C01', 2000);

    expect(evalC00.generatedMessage).not.toBe(evalC01.generatedMessage);
    expect(evalC01.selectedDetectionIds.length).toBeLessThanOrEqual(3);
  });

  it('suppresses duplicate messages within repeat window', () => {
    const scenario = scenarioManager.getDefaultScenario();
    const step = simulationEngine.getStepForTime(scenario, 0);
    const detections = simulationEngine.materializeStepDetections(step);

    const first = policyEngine.evaluateSimulatedStep(step, detections, 'C01', 10000);
    const second = policyEngine.evaluateSimulatedStep(step, detections, 'C01', 12000);

    expect(first.suppressedDuplicate).toBe(false);
    expect(second.suppressedDuplicate).toBe(true);
  });

  it('never invents bus routes or safe crossing advice in ConversationService', () => {
    const busScenario = scenarioManager.getScenarioById('esperando-autobus')!;
    const step = simulationEngine.getStepForTime(busScenario, 0);
    const detections = simulationEngine.materializeStepDetections(step);

    const routeReply = conversationService.answerQuestion('¿Qué ruta es?', {
      mode: 'simulation',
      scenario: busScenario,
      activeDetections: detections,
      lastMessage: busScenario.defaultMessage,
    });
    expect(routeReply).toContain('no tengo información suficiente para confirmar su ruta');

    const crossingReply = conversationService.answerQuestion('¿Puedo cruzar la calle?', {
      mode: 'simulation',
      scenario: busScenario,
      activeDetections: detections,
      lastMessage: busScenario.defaultMessage,
    });
    expect(crossingReply).toContain('Advertencia de seguridad');
  });

  it('handles insufficient information scenario without hallucinating objects', () => {
    const insufficient = scenarioManager.getScenarioById('informacion-insuficiente')!;
    const step = simulationEngine.getStepForTime(insufficient, 0);
    const detections = simulationEngine.materializeStepDetections(step);

    const reply = conversationService.answerQuestion('¿Qué objetos identificaste?', {
      mode: 'simulation',
      scenario: insufficient,
      activeDetections: detections,
      lastMessage: insufficient.defaultMessage,
    });
    expect(reply).toBe('No tengo información suficiente para describir con confianza esta escena.');
  });

  it('triggers inanimate obstacle alert when static object is directly in front', () => {
    const scenario = scenarioManager.getDefaultScenario();
    const step2 = simulationEngine.getStepForTime(scenario, 1);
    const detections = simulationEngine.materializeStepDetections(step2);

    const evalStep2 = policyEngine.evaluateSimulatedStep(step2, detections, 'C01', 5000);
    expect(evalStep2.obstacleAlert).not.toBeNull();
    expect(evalStep2.obstacleAlert?.labelEs).toBe('Poste en acera');
    expect(evalStep2.obstacleAlert?.zone).toBe('front_close');
  });
});

describe('AVISIA v3.0 Assistive Vision & Anti-False-Alarm Suite', () => {
  it('filters out single-frame noisy flicker and confirms stable multi-frame objects', () => {
    const tracker = new TemporalTrackerService();
    const noisyFrame1: Detection = {
      id: 'raw-1',
      category: 'chair',
      labelEs: 'Silla',
      source: 'real_video',
      confidence: 0.42,
      bbox: { x: 40, y: 40, width: 20, height: 30 },
      confirmationStatus: 'confirmed',
      priority: 90,
      firstSeenAt: 1000,
      lastSeenAt: 1000,
      isInanimateObstacle: true,
      proximityZone: 'front_mid',
    };

    // Frame 1: low-confidence flicker should NOT be confirmed yet
    const out1 = tracker.update([noisyFrame1], 1000);
    expect(out1.length).toBe(0);

    // Frame 2: same object persists -> now confirmed with smoothed bbox
    const frame2 = { ...noisyFrame1, id: 'raw-2', bbox: { x: 42, y: 41, width: 20, height: 30 } };
    const out2 = tracker.update([frame2], 1450);
    expect(out2.length).toBe(1);
    expect(out2[0].confirmationStatus).toBe('confirmed');
    expect(out2[0].framesConfirmed).toBe(2);
  });

  it('covers all 80 COCO classes in Spanish and estimates realistic class-scaled pinhole distances', () => {
    expect(Object.keys(CATEGORY_MAP).length).toBeGreaterThanOrEqual(80);
    expect(CATEGORY_MAP['parking meter'].labelEs).toBe('Parquímetro');
    expect(CATEGORY_MAP.refrigerator.isInanimateObstacle).toBe(true);

    // Same 30% bbox height: a 3.1m bus is much farther than a 0.12m cup
    const busMeters = estimatePinholeMeters(30, CATEGORY_MAP.bus.typicalHeightMeters);
    const cupMeters = estimatePinholeMeters(30, CATEGORY_MAP.cup.typicalHeightMeters);
    expect(busMeters).toBeGreaterThan(cupMeters * 5);

    expect(computeClockPosition(10)).toBe('a las 9');
    expect(computeClockPosition(30)).toBe('a las 10');
    expect(computeClockPosition(50)).toBe('a las 12');
    expect(computeClockPosition(70)).toBe('a las 2');
    expect(computeClockPosition(90)).toBe('a las 3');
  });

  it('formats live alerts using clock-face directions and intuitive step distances', () => {
    const policy = new MessagePolicy();
    expect(formatDistanceSteps(0.8)).toBe('muy cerca, a un paso');
    expect(formatDistanceSteps(1.5)).toBe('a dos pasos');

    const det: Detection = {
      id: 'trk-1',
      category: 'chair',
      labelEs: 'Silla',
      source: 'real_video',
      confidence: 0.81,
      bbox: { x: 42, y: 50, width: 22, height: 38 },
      confirmationStatus: 'confirmed',
      priority: 90,
      firstSeenAt: 1000,
      lastSeenAt: 1500,
      isInanimateObstacle: true,
      proximityZone: 'front_close',
      estimatedMeters: 0.8,
      clockPosition: 'a las 12',
    };

    const res = policy.evaluateRealDetections([det], 'C01', 2000, false, true);
    expect(res.generatedMessage).toContain('a las 12');
    expect(res.generatedMessage).toContain('a un paso');
  });

  it('synthesizes honest local scene summaries for covered lenses and clear sides', () => {
    const blocked = assistiveVisionService.buildLocalSceneSummary(
      [],
      {
        level: 'clear',
        estimatedMeters: null,
        corridorScore: 0,
        verticalObstacleDetected: false,
        floorVariationDetected: false,
        flatWallAhead: false,
        approachingFast: false,
        ttcSeconds: null,
        cameraQuality: 'lens_blocked',
        brightnessPct: 4,
        motionScore: 0,
        alertText: null,
      },
      null
    );
    expect(blocked.toLowerCase()).toContain('cubierta');

    const clearRight = assistiveVisionService.buildLocalSceneSummary(
      [],
      null,
      {
        leftCloseness: 78,
        centerCloseness: 80,
        rightCloseness: 30,
        estimatedMeters: 1.1,
        closeObstacleAhead: true,
        wallAhead: true,
        stepDetectedInDepth: false,
        clearSide: 'right',
        inferenceMs: 120,
        backend: 'wasm',
      }
    );
    expect(clearRight.toLowerCase()).toContain('pared');
    expect(clearRight.toLowerCase()).toContain('derecha');
  });

  it('detects doors, curtains, and clear walkable floor from SegFormer ADE20K masks', () => {
    const w = 40;
    const h = 40;
    const makeRectMask = (x1: number, y1: number, x2: number, y2: number) => {
      const data = new Uint8Array(w * h);
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          data[y * w + x] = 255;
        }
      }
      return { data, width: w, height: h };
    };

    // Scene 1: Door on left (a las 10), curtain on right (a las 2), clear floor in lower-center
    const indoor = parseArchitecturalSegments([
      { label: 'door', mask: makeRectMask(2, 6, 12, 32) },
      { label: 'curtain', mask: makeRectMask(28, 4, 38, 30) },
      { label: 'floor', mask: makeRectMask(8, 22, 32, 39) },
    ]);

    expect(indoor.detectedLabelsEs).toContain('Puerta');
    expect(indoor.detectedLabelsEs).toContain('Cortina');
    expect(indoor.walkableCorridorPct).toBeGreaterThanOrEqual(40);
    expect(indoor.pathVisuallyClear).toBe(true);

    // Scene 2: Solid wall filling the center corridor with no floor => blocked!
    const blockedWall = parseArchitecturalSegments([
      { label: 'wall', mask: makeRectMask(4, 4, 36, 38) },
    ]);
    expect(blockedWall.detectedLabelsEs).toContain('Pared');
    expect(blockedWall.pathVisuallyClear).toBe(false);
  });

  it('classifies open, closed, and semi-open doors using depth discontinuity', () => {
    const makeGrid = (fillFn: (xPct: number, yPct: number) => number): DepthGrid => {
      const width = 24;
      const height = 18;
      const values = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          values[y * width + x] = fillFn((x / width) * 100, (y / height) * 100);
        }
      }
      return { width, height, values };
    };

    const doorBox = { x: 35, y: 15, width: 30, height: 70 };

    // Open door: surrounding wall frame is closer (0.72) than deeper open interior (0.34)
    const openGrid = makeGrid((x) => (x >= 35 && x <= 65 ? 0.34 : 0.72));
    const openRes = classifyDoorState(doorBox, openGrid, 70);
    expect(openRes.state).toBe('open');
    expect(openRes.isInanimateObstacle).toBe(false);

    // Closed door: interior depth matches surrounding wall plane (~0.68)
    const closedGrid = makeGrid(() => 0.68);
    const closedRes = classifyDoorState(doorBox, closedGrid, 15);
    expect(closedRes.state).toBe('closed');
    expect(closedRes.isInanimateObstacle).toBe(true);

    // Semi-open door: strong left-vs-right depth slant across door leaf
    const semiGrid = makeGrid((x) => (x >= 35 && x < 50 ? 0.85 : x >= 50 && x <= 65 ? 0.45 : 0.62));
    const semiRes = classifyDoorState(doorBox, semiGrid, 30);
    expect(semiRes.state).toBe('semi_open');
    expect(semiRes.isInanimateObstacle).toBe(true);
  });

  it('detects geometric open doorway between flanking walls and computes 5-sector Stixel detours', () => {
    const w = 40;
    const h = 40;
    const makeRectMask = (x1: number, y1: number, x2: number, y2: number) => {
      const data = new Uint8Array(w * h);
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          data[y * w + x] = 255;
        }
      }
      return { data, width: w, height: h };
    };

    // Flanking walls on left (x:0..14) and right (x:26..40), floor penetrating straight through center (x:15..25)
    const leftWall = makeRectMask(0, 4, 15, 34);
    const rightWall = makeRectMask(25, 4, 40, 34);
    const mergedWallData = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      mergedWallData[i] = Math.max(leftWall.data[i], rightWall.data[i]);
    }

    const doorwayArch = parseArchitecturalSegments([
      { label: 'wall', mask: { data: mergedWallData, width: w, height: h } },
      { label: 'floor', mask: makeRectMask(15, 16, 25, 39) },
    ]);

    expect(doorwayArch.openDoorwayDetected).toBe(true);
    const enriched = enrichDoorsWithDepth(doorwayArch.detections, doorwayArch, null);
    expect(enriched.some((d) => d.doorState === 'open')).toBe(true);

    // Stixel corridor with left + center blocked by a close chair, right side open => recommends detour to right (a las 2)
    const openFloorArch = parseArchitecturalSegments([
      { label: 'floor', mask: makeRectMask(0, 16, 40, 39) },
    ]);
    const centerLeftChair: Detection = {
      id: 'trk-chair',
      category: 'chair',
      labelEs: 'Silla',
      source: 'real_video',
      confidence: 0.85,
      bbox: { x: 4, y: 42, width: 58, height: 50 },
      confirmationStatus: 'confirmed',
      priority: 90,
      firstSeenAt: 1000,
      lastSeenAt: 1500,
      isInanimateObstacle: true,
      proximityZone: 'front_close',
      estimatedMeters: 0.7,
      clockPosition: 'a las 12',
    };

    const plan = computeStixelCorridor([centerLeftChair], openFloorArch, null, null);
    expect(plan.centerClear).toBe(false);
    expect(plan.recommendedDetour?.direction).toBe('right');
    expect(plan.guidanceText.toLowerCase()).toContain('derecha');
  });

  it('applies the 5 simplified Android general presets cleanly', () => {
    expect(APP_PRESETS.length).toBe(5);
    const base: StreetAssistFeatures = {
      streetMode: false,
      stereoSonar: false,
      soundOnlyMode: false,
      handsFreeWakeWord: false,
      headsetButton: false,
      depthAnythingEnabled: false,
      architecturalVisionEnabled: true,
      archModelVariant: 'segformer_b0',
      showStixelOverlay: true,
      audioVerbosity: 'essential',
      activePreset: 'indoor',
      detectorEngine: 'efficientdet_lite2',
      clockFaceDirections: true,
    };

    const indoor = applyAppPreset(base, 'indoor');
    expect(indoor.archModelVariant).toBe('segformer_b1');
    expect(indoor.audioVerbosity).toBe('essential');

    const street = applyAppPreset(base, 'street');
    expect(street.streetMode).toBe(true);
    expect(street.stereoSonar).toBe(true);

    const precision = applyAppPreset(base, 'precision');
    expect(precision.depthAnythingEnabled).toBe(true);
    expect(precision.audioVerbosity).toBe('detailed');

    const silent = applyAppPreset(base, 'silent');
    expect(silent.soundOnlyMode).toBe(true);
  });

  it('recognizes all Nicaraguan Córdoba (NIO) and US Dollar (USD) denominations and voice triggers', () => {
    expect(isBanknoteQuestion('¿De cuánto es este billete?')).toBe(true);
    expect(isBanknoteQuestion('de cuanto es este billete')).toBe(true);
    expect(isBanknoteQuestion('¿Qué billete es este?')).toBe(true);
    expect(isBanknoteQuestion('¿Qué hay frente a mí?')).toBe(false);

    // All 7 current Nicaraguan Córdoba denominations
    expect(NIO_DENOMINATIONS).toEqual([10, 20, 50, 100, 200, 500, 1000]);
    for (const denom of NIO_DENOMINATIONS) {
      const parsed = parseBanknoteFromOcrText(`BANCO CENTRAL DE NICARAGUA ${denom} CORDOBAS`);
      expect(parsed.currency).toBe('NIO');
      expect(parsed.denomination).toBe(denom);
      expect(parsed.spokenText).toContain(`${denom} córdobas`);
    }

    // All 7 common US Dollar denominations
    expect(USD_DENOMINATIONS).toEqual([1, 2, 5, 10, 20, 50, 100]);
    for (const denom of USD_DENOMINATIONS) {
      const parsed = parseBanknoteFromOcrText(`THE UNITED STATES OF AMERICA ${denom} DOLLARS`);
      expect(parsed.currency).toBe('USD');
      expect(parsed.denomination).toBe(denom);
    }

    // Portrait cue fallback for USD & safety refusal on blank text
    const franklin = parseBanknoteFromOcrText('FEDERAL RESERVE NOTE FRANKLIN');
    expect(franklin.currency).toBe('USD');
    expect(franklin.denomination).toBe(100);

    const unclear = parseBanknoteFromOcrText('texto borroso sin valor');
    expect(unclear.detected).toBe(false);
    expect(unclear.currency).toBe('unknown');
    expect(unclear.denomination).toBeNull();

    // Automatic continuous scan parser stays silent on NONE and detects real replies
    expect(parseCloudBanknoteReply('NONE').detected).toBe(false);
    const autoNio = parseCloudBanknoteReply('Billete de 500 córdobas.');
    expect(autoNio.detected).toBe(true);
    expect(autoNio.currency).toBe('NIO');
    expect(autoNio.denomination).toBe(500);
    const autoUsd = parseCloudBanknoteReply('Billete de 20 dólares.');
    expect(autoUsd.detected).toBe(true);
    expect(autoUsd.currency).toBe('USD');
    expect(autoUsd.denomination).toBe(20);
  });
});
