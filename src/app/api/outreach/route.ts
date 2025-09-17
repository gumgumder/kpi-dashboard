// app/api/outreach/route.ts
import { NextRequest } from 'next/server';
import { sheetsClient } from '@/lib/google/sheets';

export async function GET(_: NextRequest) {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEETS_OUTREACH_SPREADSHEET_ID;
        if (!spreadsheetId) return new Response('Missing sheet ID', { status: 500 });

        const range = process.env.OUTREACH_RANGE || 'Overview!A1:G'; // put your tab here
        const sheets = sheetsClient();
        const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        return Response.json({ range, values: data.values ?? [] });
    } catch (err: any) {
        console.error('Outreach API error:', err);
        const msg = err?.errors?.[0]?.message || err?.message || 'Failed to load sheet';
        return new Response(msg, { status: 500 });
    }
}
