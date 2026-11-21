import { MANAGUA_SCENARIOS } from '../scenarios/managuaScenarios';
import type { Scenario } from '../types/avicia';

export class ScenarioManager {
  private scenarios: Scenario[] = MANAGUA_SCENARIOS;

  getAllScenarios(): Scenario[] {
    return this.scenarios;
  }

  getScenarioById(id: string): Scenario | undefined {
    return this.scenarios.find((s) => s.id === id);
  }

  getDefaultScenario(): Scenario {
    return this.scenarios[0];
  }
}

export const scenarioManager = new ScenarioManager();

