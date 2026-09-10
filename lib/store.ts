// In-memory incident store for the demo. Sufficient for a single Cloud Run
// instance during a live demo; state resets on cold start / restart and is
// not shared across instances. Firestore is the documented upgrade path —
// see docs/ARCHITECTURE.md.
import type { IncidentTrace } from './types';

const incidents = new Map<string, IncidentTrace>();

export function saveIncident(trace: IncidentTrace): void {
  incidents.set(trace.id, trace);
}

export function getIncident(id: string): IncidentTrace | undefined {
  return incidents.get(id);
}

export function listIncidents(): IncidentTrace[] {
  return [...incidents.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listAuditLog() {
  return listIncidents()
    .flatMap((i) => i.auditLog)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}
