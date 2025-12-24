// src/app/api/outreach/route.ts
import 'server-only';
import { NextRequest } from 'next/server';
import { buildOutreachPayload } from '@/app/api/outreach/buildPayload';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const year = searchParams.get('year') ?? '2025';

        const payload = await buildOutreachPayload(year);
        return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(msg || 'Failed', { status: 500 });
    }
}
