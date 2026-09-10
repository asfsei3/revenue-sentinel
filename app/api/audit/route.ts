import { NextResponse } from 'next/server';
import { listAuditLog } from '../../../lib/store';

export async function GET() {
  return NextResponse.json({ auditLog: listAuditLog() });
}
