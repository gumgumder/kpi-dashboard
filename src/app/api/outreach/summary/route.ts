// src/app/api/outreach/summary/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { buildOutreachPayload, TabAgg } from '@/app/api/outreach/buildPayload';
import { summarizePeriodTotals } from '@/lib/metrics/summarize';

type Body = { start: string; end: string; fields: string[]; tab?: string; force?: boolean };

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Partial<Body>;
        if (!body?.start || !body?.end || !Array.isArray(body?.fields) || body.fields.length === 0) {
            return NextResponse.json({ error: 'Required: start, end, fields[]' }, { status: 400 });
        }
        const { tabs, generatedAt } = await buildOutreachPayload(Boolean(body.force));
        const tabName = body.tab ?? 'Merged';
        const tab = tabs.find(t => t.tab === tabName) as TabAgg | undefined;
        if (!tab) return NextResponse.json({ error: `Tab not found: ${tabName}` }, { status: 404 });

        const summary = summarizePeriodTotals(tab, body.start, body.end, body.fields);
        return NextResponse.json({ tab: tabName, period: { start: body.start, end: body.end }, fields: body.fields, summary, generatedAt },
            { headers: { 'Cache-Control': 'no-store' } });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg || 'Server error' }, { status: 500 });
    }
}