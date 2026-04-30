/**
 * POST /api/ingest — accept an RDS PDF, parse, persist, return summary.
 * See: docs/design/mvp.md §6.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function POST(_req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(
    { error: 'Not implemented yet — see docs/design/mvp.md §6' },
    { status: 501 },
  );
}
