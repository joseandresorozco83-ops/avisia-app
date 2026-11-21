import type { Detection, Scenario, ScenarioStep } from '../types/avicia';

export class SimulationEngine {
  materializeStepDetections(step: ScenarioStep, now: number = Date.now()): Detection[] {
    return step.detections.map((d) => ({
      ...d,
      firstSeenAt: now,
      lastSeenAt: now,
    }));
  }

  getStepForTime(scenario: Scenario, stepIndex: number): ScenarioStep {
    const safeIndex = Math.max(0, Math.min(stepIndex, scenario.steps.length - 1));
    return scenario.steps[safeIndex];
  }
}

export const simulationEngine = new SimulationEngine();

