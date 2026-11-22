import type { Detection, OperationMode, Scenario } from '../types/avicia';
import type { RealGpsPosition } from './LocationService';
import { formatDistanceSteps } from './MessagePolicy';
import { isBanknoteQuestion } from './CurrencyRecognitionService';

export interface ConversationContext {
  mode: OperationMode;
  scenario: Scenario;
  activeDetections: Detection[];
  lastMessage: string;
  realGps?: RealGpsPosition | null;
}

/**
 * Intent-based conversational engine (Hablar con AVICIA).
 * Strictly answers from active scenario or verified real detections.
 * Never invents objects, bus routes, distances, or unsafe navigation advice.
 */
export class ConversationService {
  answerQuestion(rawQuestion: string, ctx: ConversationContext): string {
    const q = this.normalize(rawQuestion);

    if (!q) {
      return 'Por favor escribe o formula una pregunta sobre la escena actual.';
    }

    // Safety guard: never provide crossing or safe navigation instructions
    if (
      q.includes('puedo cruzar') ||
      q.includes('cruzar la calle') ||
      q.includes('es seguro caminar') ||
      q.includes('puedo avanzar') ||
      q.includes('por donde camino')
    ) {
      return 'Advertencia de seguridad: AVISIA es un simulador conceptual y no puede confirmar si es seguro cruzar ni dar instrucciones de desplazamiento autónomo.';
    }

    // Repeat last message
    if (q.includes('repetir') || q.includes('repite') || q.includes('otra vez')) {
      return ctx.lastMessage
        ? `Repito el último mensaje: ${ctx.lastMessage}`
        : 'Aún no hay un mensaje emitido en este escenario.';
    }

    // Banknote / currency inquiry (Córdobas NIO & US Dollars)
    if (isBanknoteQuestion(rawQuestion)) {
      return 'Para identificar un billete en córdobas o dólares, activa la cámara en vivo o el canal Billetes y muéstralo frente al lente con buena luz.';
    }

    // Bus route inquiry (explicit rule for Scenario 2 and general)
    if (q.includes('ruta') || q.includes('numero de bus') || q.includes('qué bus es') || q.includes('que bus es')) {
      if (ctx.mode === 'simulation') {
        return (
          ctx.scenario.qaKnowledge.busRouteReply ??
          'En esta demostración no tengo información para confirmar rutas ni recorridos de autobuses.'
        );
      }
      return 'El detector visual actual identifica categorías generales de objetos, pero no lee ni confirma rutas de autobuses.';
    }

    // Real vision modes (Mode B or Mode C)
    if (ctx.mode !== 'simulation') {
      return this.answerForRealMode(q, ctx);
    }

    // Simulated Mode A intents
    if (q.includes('que hay frente') || q.includes('qué hay frente') || q.includes('frente a mi') || q.includes('que ves') || q.includes('describe')) {
      return ctx.scenario.qaKnowledge.whatIsInFront;
    }

    if (q.includes('autobus') || q.includes('bus')) {
      return ctx.scenario.qaKnowledge.hasBus;
    }

    if (q.includes('persona') || q.includes('gente') || q.includes('alguien')) {
      return ctx.scenario.qaKnowledge.hasPeople;
    }

    if (q.includes('donde estoy') || q.includes('ubica')) {
      if (ctx.realGps) {
        const place = ctx.realGps.placeName ?? 'tu ubicación actual';
        return `Tu GPS indica que estás en ${place}, con precisión de ${Math.round(ctx.realGps.accuracy)} metros.`;
      }
      return ctx.scenario.qaKnowledge.whereAmI;
    }

    if (q.includes('que tengo cerca') || q.includes('cerca') || q.includes('alrededor')) {
      return ctx.scenario.qaKnowledge.whatNearby;
    }

    if (q.includes('identificaste') || q.includes('objetos')) {
      if (ctx.scenario.insufficientEvidence) {
        return ctx.scenario.defaultMessage;
      }
      const labels = Array.from(new Set(ctx.activeDetections.map((d) => d.labelEs)));
      return labels.length > 0
        ? `En esta escena identifiqué: ${labels.join(', ')}.`
        : 'No hay objetos confirmados en este momento.';
    }

    if (q.includes('significa') || q.includes('deteccion') || q.includes('como funciona')) {
      return ctx.scenario.qaKnowledge.detectionMeaning;
    }

    return 'Puedo responder sobre qué hay frente a ti, si hay personas o autobuses, qué objetos se identificaron, qué significa la detección o tu ubicación simulada en Managua.';
  }

  private answerForRealMode(q: string, ctx: ConversationContext): string {
    const dets = ctx.activeDetections;
    const labels = Array.from(new Set(dets.map((d) => d.labelEs)));

    if (q.includes('donde estoy')) {
      if (ctx.realGps) {
        const place = ctx.realGps.placeName ?? 'tu ubicación actual';
        return `Estás en ${place}, con precisión de ${Math.round(ctx.realGps.accuracy)} metros.`;
      }
      return 'No hay GPS real activo. Activa el GPS en el mapa para conocer tu ubicación real.';
    }

    if (q.includes('autobus') || q.includes('bus')) {
      const hasBus = dets.some((d) => d.category === 'bus');
      return hasBus
        ? 'El detector identificó al menos un autobús en la imagen actual, sin información sobre su ruta.'
        : 'El modelo no detectó ningún autobús sobre el umbral configurado.';
    }

    if (q.includes('persona') || q.includes('gente')) {
      const count = dets.filter((d) => d.category === 'person').length;
      return count > 0
        ? `El modelo detectó ${count} ${count === 1 ? 'persona' : 'personas'} en la imagen.`
        : 'No se detectaron personas sobre el umbral de confianza actual.';
    }

    if (q.includes('que hay') || q.includes('objetos') || q.includes('identificaste') || q.includes('ves') || q.includes('describe')) {
      if (dets.length === 0) {
        return 'No hay detecciones confirmadas frente a la cámara en este momento.';
      }
      const detailed = dets.slice(0, 4).map((d) => {
        const pos = d.clockPosition ?? 'al frente';
        const dist = formatDistanceSteps(d.estimatedMeters);
        return dist ? `${d.labelEs.toLowerCase()} ${pos} (${dist})` : `${d.labelEs.toLowerCase()} ${pos}`;
      });
      return `Frente a ti confirmo: ${detailed.join('; ')}.`;
    }

    return labels.length > 0
      ? `Detecciones actuales: ${labels.join(', ')}. Usa el canal Escena o Texto para mayor detalle.`
      : 'En este modo respondo según las detecciones confirmadas por la cámara.';
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}

export const conversationService = new ConversationService();

