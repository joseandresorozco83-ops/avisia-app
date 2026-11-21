import { describe, it, expect, beforeEach } from 'vitest';
import { scenarioManager } from '../ScenarioManager';
import { MessagePolicy } from '../MessagePolicy';
import { conversationService } from '../ConversationService';
import { simulationEngine } from '../SimulationEngine';

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

