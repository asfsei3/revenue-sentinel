import { NextResponse } from 'next/server';
import { investigateScenario, ScenarioNotFoundError } from '../../../lib/pipeline';
import { logger } from '../../../lib/logger';

export async function POST(req: Request) {
  let body: { scenarioId?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.scenarioId || typeof body.scenarioId !== 'string') {
    return NextResponse.json({ error: 'scenarioId is required' }, { status: 400 });
  }

  try {
    const trace = await investigateScenario(body.scenarioId, body.mode);
    return NextResponse.json({ incident: trace });
  } catch (err) {
    if (err instanceof ScenarioNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    logger.error('investigate_failed', { error: String(err) });
    return NextResponse.json({ error: 'Investigation failed' }, { status: 500 });
  }
}
