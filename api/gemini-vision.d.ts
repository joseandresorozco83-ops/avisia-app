export function resetRateLimitStore(): void;
export function isOriginAllowed(origin: string): boolean;
export function sanitizeVisualQuestion(rawQuestion: unknown): string;
export function buildServerPrompt(task: unknown, question?: unknown): string | null;
export function parseStructuredSceneResponse(rawText: unknown): {
  spokenText: string;
  structured: {
    immediateHazard: string | null;
    hazardClock: string | null;
    freeSteps: number | null;
    clearDirection: 'frente' | 'izquierda' | 'derecha' | 'detenerse';
    summary: string;
    confidence: 'high' | 'medium' | 'low';
  };
} | null;
export function checkRateLimit(
  clientKey: string,
  now?: number
): { allowed: boolean; remaining: number; retryAfterSec: number };

export default function handler(
  req: {
    method?: string;
    headers?: Record<string, string | undefined>;
    body?: unknown;
    socket?: { remoteAddress?: string };
  },
  res: {
    setHeader: (k: string, v: string | string[]) => void;
    status: (code: number) => { json: (data: unknown) => unknown; end: () => unknown };
  }
): Promise<unknown>;
