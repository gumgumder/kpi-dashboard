// src/app/api/outreach/route.ts
import 'server-only';
import { buildOutreachPayload } from '@/app/api/outreach/buildPayload';

export async function GET() {
    try {
        const payload = await buildOutreachPayload();
        return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e: any) {
        return new Response(e?.message ?? 'Failed', { status: 500 });
    }
}
