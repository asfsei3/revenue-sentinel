import { NextResponse } from 'next/server';
import { getIncident } from '../../../../lib/store';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incident = getIncident(id);
  if (!incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  return NextResponse.json({ incident });
}
