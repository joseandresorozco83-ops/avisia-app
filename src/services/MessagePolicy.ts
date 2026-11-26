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

export interface DeltaNarrationState {
  meters: number | null;
  zone: 'front_close' | 'front_mid' | 'side';
  clock: string;
  spokenAt: number;
}

export function formatDistanceSteps(meters?: number | null): string {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return '';
  if (meters <= 0.9) return 'muy cerca, a un paso';
  if (meters <= 1.7) return 'a dos pasos';
  if (meters <= 2.6) return 'a tres pasos';
  return `a unos ${Math.round(meters)} metros`;
}

/**
 * Parsimonious Delta Narration gate (NavGraph / LAZAR 2025):
 * Authorizes a verbal notification ONLY when:
 * 1) A new hazard enters the corridor,
 * 2) The hazard moved noticeably closer (>= 0.6m) or escalated to front_close,
 * 3) Or the calm repeat cooldown elapsed while still blocking the user.
 */
export function shouldSpeakDeltaHazard(
  prev: DeltaNarrationState | undefined,
  next: { meters: number | null; zone: 'front_close' | 'front_mid' | 'side'; clock: string },
  now: number,
  cooldownMs: number
): boolean {
  if (!prev) return true;
  if (prev.zone !== 'front_close' && next.zone === 'front_close') return true;
  if (
    prev.meters !== null &&
    next.meters !== null &&
    prev.meters - next.meters >= 0.6 &&
    now - prev.spokenAt >= 2600
  ) {
    return true;
  }
  return now - prev.spokenAt >= cooldownMs;
}

/**
 * Independent MessagePolicy module.
 * Evaluates detections under policy C00 (arrival/eligibility order)
 * or policy C01 (preference, novelty, confirmed change, clock-face + step phrasing).
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

    void pendingOrInsufficient;

    const obstacleAlert = this.detectFrontObstacle(detections, false, false);

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
    streetMode = false,
    useClockFace = true
  ): PolicyEvaluation {
    const confirmedOnly = detections.filter((d) => d.confirmationStatus === 'confirmed');

    if (confirmedOnly.length === 0) {
      return {
        policy,
        selectedDetectionIds: [],
        discardedDetectionIds: detections.map((d) => d.id),
        generatedMessage: streetMode
          ? 'Camino despejado.'
          : 'Camino despejado al frente.',
        reason: 'Sin obstáculos confirmados frente a la cámara.',
        suppressedDuplicate: false,
        timestamp: now,
      };
    }

    const urgencyScore = (d: Detection): number => {
      let score = d.priority;
      if (d.proximityZone === 'front_close') score += 50;
      else if (d.proximityZone === 'front_mid') score += 22;
      else score -= 18;
      if (d.isInanimateObstacle) score += 14;
      if (typeof d.estimatedMeters === 'number' && Number.isFinite(d.estimatedMeters)) {
        if (d.estimatedMeters <= 1.2) score += 45;
        else if (d.estimatedMeters <= 2.0) score += 25;
        else if (d.estimatedMeters > 3.2) score -= 28;
      }
      return score;
    };

    const eligible =
      policy === 'C00'
        ? confirmedOnly
        : [...confirmedOnly].sort((a, b) => urgencyScore(b) - urgencyScore(a));

    const selected = eligible.slice(0, policy === 'C00' ? 4 : 2);
    const selectedIds = selected.map((d) => d.id);
    const discardedIds = detections
      .filter((d) => !selectedIds.includes(d.id))
      .map((d) => d.id);

    const obstacleAlert = this.detectFrontObstacle(eligible, streetMode, useClockFace);

    let generatedMessage: string;
    if (obstacleAlert) {
      generatedMessage = obstacleAlert.message;
    } else if (selected.length > 0) {
      const top = selected[0];
      const spatial = useClockFace
        ? top.clockPosition ?? this.clockPhrase(top)
        : this.directionWord(top);
      const dist = formatDistanceSteps(top.estimatedMeters);
      if (streetMode) {
        generatedMessage = dist
          ? `${top.labelEs} ${spatial}, ${dist}.`
          : `${top.labelEs} ${spatial}.`;
      } else {
        const secondary =
          selected.length > 1 ? ` También ${this.withArticle(selected[1].labelEs.toLowerCase())}.` : '';
        generatedMessage = dist
          ? `${top.labelEs} ${spatial}, ${dist}.${secondary}`
          : `${top.labelEs} ${spatial}.${secondary}`;
      }
    } else {
      generatedMessage = 'Sin objetos claros.';
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
          ? 'Política C00 aplicada sobre detecciones confirmadas por orden de salida.'
          : 'Política C01 priorizando peligro frontal, posición tipo reloj y distancia en pasos.',
      suppressedDuplicate,
      timestamp: now,
      obstacleAlert,
    };
  }

  private detectFrontObstacle(
    detections: Detection[],
    streetMode = false,
    useClockFace = false
  ): ObstacleAlert | null {
    // Prefer front_close inanimate hazards first; only alert on front_mid if within 3 steps (<= 2.6m)
    const frontObstacle =
      detections.find(
        (d) =>
          d.isInanimateObstacle &&
          d.confirmationStatus === 'confirmed' &&
          d.proximityZone === 'front_close' &&
          (d.estimatedMeters === undefined || d.estimatedMeters === null || d.estimatedMeters <= 2.6)
      ) ??
      detections.find(
        (d) =>
          d.isInanimateObstacle &&
          d.confirmationStatus === 'confirmed' &&
          d.proximityZone === 'front_mid' &&
          (d.estimatedMeters === undefined || d.estimatedMeters === null || d.estimatedMeters <= 2.4)
      );

    if (!frontObstacle) return null;

    const zone = frontObstacle.proximityZone === 'front_close' ? 'front_close' : 'front_mid';
    const labelLower = frontObstacle.labelEs.toLowerCase();
    const spatial = useClockFace
      ? frontObstacle.clockPosition ?? this.clockPhrase(frontObstacle)
      : this.directionWord(frontObstacle);
    const dist = formatDistanceSteps(frontObstacle.estimatedMeters);

    const isImminentEmergency =
      zone === 'front_close' &&
      ((typeof frontObstacle.estimatedMeters === 'number' &&
        frontObstacle.estimatedMeters <= 0.75) ||
        labelLower.includes('grada') ||
        labelLower.includes('bajada') ||
        labelLower.includes('desnivel') ||
        labelLower.includes('escalera') ||
        labelLower.includes('pared'));

    let message: string;
    if (streetMode) {
      message = dist
        ? `${isImminentEmergency ? '¡Alto! ' : ''}${frontObstacle.labelEs} ${spatial}, ${dist}`
        : `${frontObstacle.labelEs} ${spatial}`;
    } else if (isImminentEmergency) {
      message = dist
        ? `¡Alto! ${frontObstacle.labelEs} ${spatial}, ${dist}.`
        : `¡Alto! ${frontObstacle.labelEs} frente a ti.`;
    } else if (zone === 'front_close') {
      message = dist
        ? `${frontObstacle.labelEs} ${spatial}, ${dist}.`
        : `${frontObstacle.labelEs} frente a ti.`;
    } else {
      message = dist
        ? `${frontObstacle.labelEs} ${spatial}, ${dist}.`
        : `${frontObstacle.labelEs} adelante.`;
    }

    return {
      labelEs: frontObstacle.labelEs,
      zone,
      message,
    };
  }

  private directionWord(det: Detection): 'a tu izquierda' | 'al frente' | 'a tu derecha' {
    const centerX = det.bbox.x + det.bbox.width / 2;
    if (centerX < 36) return 'a tu izquierda';
    if (centerX > 64) return 'a tu derecha';
    return 'al frente';
  }

  private clockPhrase(det: Detection): string {
    const centerX = det.bbox.x + det.bbox.width / 2;
    if (centerX < 20) return 'a las 9';
    if (centerX < 38) return 'a las 10';
    if (centerX <= 62) return 'a las 12';
    if (centerX <= 80) return 'a las 2';
    return 'a las 3';
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
}

export const messagePolicy = new MessagePolicy();
