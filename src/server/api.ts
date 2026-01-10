// src/server/api.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { getRevenueValuesCached } from '@/server/services/googleSheetsCache.service';

type Ctx = { req: Request; url: URL; body: any };

const actions: Record<string, (ctx: Ctx) => Promise<any>> = {
    revenue: async ({ url }) => {
        const year = url.searchParams.get('year') ?? String(new Date().getFullYear());
        return getRevenueValuesCached(year);
    },
    // outreach: async (...) => ...
};

export async function handleApiRequest(req: Request) {
    const url = new URL(req.url);

    let body: any = null;
    let action = url.searchParams.get('action') ?? '';

    if (!action && req.method === 'POST') {
        body = await req.json().catch(() => null);
        action = String(body?.action ?? '');
    }

    const fn = actions[action];
    if (!fn) return new NextResponse(`Unknown action: ${action}`, { status: 400 });

    try {
        const result = await fn({ req, url, body });
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return new NextResponse(`Upstream error: ${msg}`, { status: 502 });
    }
}
