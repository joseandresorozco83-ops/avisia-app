import type {
  Detection,
  ObstacleAlert,
  PolicyEvaluation,
  PolicyType,
  ScenarioStep,
} from '../types/avicia';

interface MessageHistoryEntry {
  message: string;
  timestamp: number;
}

/**
 * Independent MessagePolicy module.
 * Evaluates detections under policy C00 (arrival/eligibility order)
 * or policy C01 (preference, novelty, and confirmed change).
 */
export class MessagePolicy {
  private lastMessages: MessageHistoryEntry[] = [];
  private readonly minRepeatIntervalMs = 6000;

  resetHistory(): void {
    this.lastMessages = [];
  }

  evaluateSimulatedStep(
    step: ScenarioStep,
    detections: Detection[],
    policy: PolicyType,
    now: number = Date.now()
  ): PolicyEvaluation {
    const confirmed = detections.filter((d) => d.confirmationStatus === 'confirmed');
    const pendingOrInsufficient = detections.filter(
      (d) => d.confirmationStatus !== 'confirmed'
    );

    const rawMessage = policy === 'C00' ? step.c00Message : step.c01Message;
    const reason = policy === 'C00' ? step.c00Reason : step.c01Reason;

    const selectedIds =
      policy === 'C00'
        ? detections
            .filter((d) => d.confirmationStatus !== 'insufficient')
            .map((d) => d.id)
        : confirmed
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 3)
            .map((d) => d.id);

    const discardedIds = detections
      .filter((d) => !selectedIds.includes(d.id))
      .map((d) => d.id);

    const suppressedDuplicate = this.isDuplicateRecentlySpoken(rawMessage, now);

    if (!suppressedDuplicate) {
      this.recordMessage(rawMessage, now);
    }

    // Keep unused reference clean for TS strictness
    void pendingOrInsufficient;

    const obstacleAlert = this.detectFrontObstacle(detections);

    return {
      policy,
      selectedDetectionIds: selectedIds,
      discardedDetectionIds: discardedIds,
      generatedMessage: rawMessage,
      reason,
      suppressedDuplicate,
      timestamp: now,
      obstacleAlert,
    };
  }

  evaluateRealDetections(
    detections: Detection[],
    policy: PolicyType,
    now: number = Date.now(),
    streetMode = false
  ): PolicyEvaluation {
    if (detections.length === 0) {
      return {
        policy,
        selectedDetectionIds: [],
        discardedDetectionIds: [],
        generatedMessage: streetMode
          ? 'Despejado.'
          : 'No se detectan objetos sobre el umbral de confianza actual.',
        reason: 'Sin detecciones válidas del modelo en este cuadro.',
        suppressedDuplicate: false,
        timestamp: now,
      };
    }

    const eligible =
      policy === 'C00'
        ? detections
        : [...detections].sort((a, b) => b.priority - a.priority);

    const selected = eligible.slice(0, policy === 'C00' ? 4 : 2);
    const selectedIds = selected.map((d) => d.id);
    const discardedIds = detections
      .filter((d) => !selectedIds.includes(d.id))
      .map((d) => d.id);

    const counts = new Map<string, number>();
    for (const det of selected) {
      counts.set(det.labelEs.toLowerCase(), (counts.get(det.labelEs.toLowerCase()) ?? 0) + 1);
    }

    const parts: string[] = [];
    for (const [label, count] of counts.entries()) {
      parts.push(count > 1 ? `${count} ${this.pluralize(label)}` : this.withArticle(label));
    }

    const obstacleAlert = this.detectFrontObstacle(detections, streetMode);

    let generatedMessage: string;
    if (obstacleAlert) {
      generatedMessage = obstacleAlert.message;
    } else if (streetMode && selected.length > 0) {
      const top = selected[0];
      generatedMessage = `${top.labelEs} ${this.directionWord(top)}.`;
    } else {
      generatedMessage =
        parts.length > 0
          ? `Al frente: ${this.joinSpanishList(parts)}.`
          : 'Sin objetos claros.';
    }

    const suppressedDuplicate = this.isDuplicateRecentlySpoken(generatedMessage, now);
    if (!suppressedDuplicate) {
      this.recordMessage(generatedMessage, now);
    }

    return {
      policy,
      selectedDetectionIds: selectedIds,
      discardedDetectionIds: discardedIds,
      generatedMessage,
      reason:
        policy === 'C00'
          ? 'Política C00 aplicada sobre detecciones reales por orden de salida.'
          : 'Política C01 aplicada sobre detecciones reales priorizando obstáculos frontales y evitando repetición.',
      suppressedDuplicate,
      timestamp: now,
      obstacleAlert,
    };
  }

  private detectFrontObstacle(
    detections: Detection[],
    streetMode = false
  ): ObstacleAlert | null {
    const frontObstacle = detections.find(
      (d) =>
        d.isInanimateObstacle &&
        d.confirmationStatus === 'confirmed' &&
        (d.proximityZone === 'front_close' || d.proximityZone === 'front_mid')
    );

    if (!frontObstacle) return null;

    const zone = frontObstacle.proximityZone === 'front_close' ? 'front_close' : 'front_mid';
    const labelLower = frontObstacle.labelEs.toLowerCase();
    const dir = this.directionWord(frontObstacle);
    const message = streetMode
      ? `${frontObstacle.labelEs} ${dir}`
      : zone === 'front_close'
        ? `Cuidado: ${labelLower} frente a ti.`
        : `Atención: ${labelLower} adelante.`;

    return {
      labelEs: frontObstacle.labelEs,
      zone,
      message,
    };
  }

  private directionWord(det: Detection): 'izquierda' | 'frente' | 'derecha' {
    const centerX = det.bbox.x + det.bbox.width / 2;
    if (centerX < 36) return 'izquierda';
    if (centerX > 64) return 'derecha';
    return 'frente';
  }

  private isDuplicateRecentlySpoken(message: string, now: number): boolean {
    const recent = this.lastMessages.find(
      (entry) => entry.message === message && now - entry.timestamp < this.minRepeatIntervalMs
    );
    return Boolean(recent);
  }

  private recordMessage(message: string, timestamp: number): void {
    this.lastMessages.push({ message, timestamp });
    if (this.lastMessages.length > 15) {
      this.lastMessages.shift();
    }
  }

  private withArticle(label: string): string {
    const firstWord = label.split(' ')[0];
    const feminine =
      firstWord.endsWith('a') ||
      firstWord === 'señal' ||
      firstWord === 'televisión' ||
      firstWord === 'pared';
    return `${feminine ? 'una' : 'un'} ${label}`;
  }

  private pluralize(label: string): string {
    if (label === 'autobús') return 'autobuses';
    if (label === 'automóvil') return 'automóviles';
    if (label === 'señal de alto') return 'señales de alto';
    if (label === 'bicicleta detenida') return 'bicicletas detenidas';
    if (label === 'obstáculo en el paso') return 'obstáculos en el paso';
    if (label === 'objeto en el suelo') return 'objetos en el suelo';
    if (label.endsWith('z')) return `${label.slice(0, -1)}ces`;
    if (/[aeiouáéíóú]$/.test(label)) return `${label}s`;
    return `${label}es`;
  }

  private joinSpanishList(items: string[]): string {
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} y ${items[1]}`;
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
  }
}

export const messagePolicy = new MessagePolicy();

