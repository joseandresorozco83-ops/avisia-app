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
import type { Detection } from '../../types/avicia';

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
});
