/**
 * GET /api/excel — build the consolidated Acumulados xlsx and stream it.
 * See: docs/design/mvp.md §7.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(
    { error: 'Not implemented yet — see docs/design/mvp.md §7' },
    { status: 501 },
  );
}
