// Gemini provider abstraction with MOCK and GEMINI reasoning modes.
//
// MOCK mode is deterministic and always available — it is the default and
// what the demo falls back to on any error, per the project's reliability
// requirement ("keep the demo reliable ... over architectural complexity").
//
// GEMINI mode calls the Gemini API directly over REST (no SDK dependency)
// when GEMINI_API_KEY is configured and AGENT_MODE=gemini. Only text
// generation is used; the model is never given tool access to any real
// payment execution API — see docs/ARCHITECTURE.md.
import { logger } from '../logger';

export type ReasoningMode = 'mock' | 'gemini';

export interface GeminiCallInput {
  agent: string;
  systemInstruction: string;
  prompt: string;
}

export interface GeminiCallResult {
  text: string;
  mode: ReasoningMode;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export function resolveReasoningMode(requested?: string): ReasoningMode {
  const envMode = (process.env.AGENT_MODE || 'mock').toLowerCase();
  const wanted = (requested || envMode) as ReasoningMode;
  if (wanted === 'gemini' && GEMINI_API_KEY) return 'gemini';
  return 'mock';
}

export function isGeminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

/**
 * Calls Gemini for a single agent reasoning step. Never throws: any
 * network/parse failure resolves to a MOCK-mode result so the pipeline
 * keeps running deterministically during a live demo.
 */
export async function callGemini(input: GeminiCallInput, mockFallback: () => string): Promise<GeminiCallResult> {
  if (!GEMINI_API_KEY) {
    return { text: mockFallback(), mode: 'mock' };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const body = {
      systemInstruction: {
        role: 'system',
        parts: [{ text: input.systemInstruction }],
      },
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn('gemini_call_failed', { agent: input.agent, status: res.status });
      return { text: mockFallback(), mode: 'mock' };
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) {
      logger.warn('gemini_empty_response', { agent: input.agent });
      return { text: mockFallback(), mode: 'mock' };
    }
    return { text: text.trim(), mode: 'gemini' };
  } catch (err) {
    logger.warn('gemini_call_error', { agent: input.agent, error: String(err) });
    return { text: mockFallback(), mode: 'mock' };
  }
}
