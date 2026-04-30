/**
 * GET /api/excel — build the consolidated Acumulados xlsx and stream it.
 * See: docs/design/mvp.md §7.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildAcumuladosXlsx } from '@/lib/excel';

export const runtime = 'nodejs';

const REPORT_TYPE = 'RDS' as const;

function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const xlsx = await buildAcumuladosXlsx({ reportTypeId: REPORT_TYPE });
  const filename = `RDS_Casa_Real_Salta_Acumulados_${todayStamp()}.xlsx`;

  return new NextResponse(new Uint8Array(xlsx), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
