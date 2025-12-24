// app/api/sheet-link/route.ts
import { NextRequest } from 'next/server';

const sheets: Record<string, Record<string, string | undefined>> = {
    outreach: {
        '2025': process.env.GOOGLE_SHEETS_KPI_NUMBERS_2025_ID,
        '2026': process.env.GOOGLE_SHEETS_KPI_NUMBERS_2026_ID,
    },
    rev: {
        '2025': process.env.GOOGLE_SHEETS_REV_2025_SPREADSHEET_ID,
        '2026': process.env.GOOGLE_SHEETS_REV_2026_SPREADSHEET_ID,
    },
    // add more here
};

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const doc = searchParams.get('doc');          // e.g. outreach
    const year = searchParams.get('year') || '2025'; // default

    const sheetId = doc ? sheets[doc]?.[year] : undefined;
    if (!sheetId) return new Response('Not found', { status: 404 });

    return Response.redirect(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, 302);
}
