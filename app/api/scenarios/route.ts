import { NextResponse } from 'next/server';
import { SCENARIOS } from '../../../lib/scenarios';
import { isGeminiConfigured } from '../../../lib/gemini/client';

export async function GET() {
  const scenarios = SCENARIOS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    injectionAttempt: Boolean(s.injectionAttempt),
    eventCount: s.events.length,
  }));
  return NextResponse.json({ scenarios, geminiAvailable: isGeminiConfigured() });
}
