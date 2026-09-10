import { NextResponse } from 'next/server';
import { getIncident, saveIncident } from '../../../../../lib/store';
import { makeAuditEvent } from '../../../../../lib/agents/observability';
import { logger } from '../../../../../lib/logger';

/**
 * Human approval gate. This endpoint can only move an incident that is
 * `pending_approval` (governance decision === APPROVAL) to `approved` or
 * `rejected`. It can never approve an incident governance already
 * classified as BLOCK — that is enforced here, not just in the UI, so a
 * compromised or careless client cannot bypass the governance layer.
 *
 * "approved" only marks the recovery action as authorized in the audit
 * trail for demo purposes; nothing in this codebase calls a real payment
 * execution API.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incident = getIncident(id);
  if (!incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

  let body: { decision?: 'approve' | 'reject'; actor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }

  if (incident.governance.decision === 'BLOCK') {
    return NextResponse.json(
      { error: 'This incident was classified BLOCK by the Governance Agent and cannot be approved through this endpoint.' },
      { status: 409 },
    );
  }

  if (incident.status !== 'pending_approval') {
    return NextResponse.json({ error: `Incident is not pending approval (status: ${incident.status})` }, { status: 409 });
  }

  const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'demo_operator';
  incident.status = body.decision === 'approve' ? 'approved' : 'rejected';
  incident.auditLog.push(
    makeAuditEvent(
      incident.id,
      'human',
      `human.${body.decision}`,
      `${actor} ${body.decision === 'approve' ? 'approved' : 'rejected'} the recommended recovery action: ${incident.recovery.description}`,
    ),
  );
  saveIncident(incident);
  logger.info('human_approval_decision', { incidentId: incident.id, decision: body.decision, actor });

  return NextResponse.json({ incident });
}
