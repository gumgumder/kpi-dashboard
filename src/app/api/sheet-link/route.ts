// app/api/sheet-link/route.ts
import { NextRequest } from 'next/server';

const sheets: Record<string, string | undefined> = {
    outreach: process.env.GOOGLE_SHEETS_OUTREACH_SPREADSHEET_ID,
    rev: process.env.GOOGLE_SHEETS_REV_SPREADSHEET_ID,
    // add more here
};

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('doc'); // e.g. /api/sheet-link?doc=outreach
    if (!key || !sheets[key]) {
        return new Response('Not found', { status: 404 });
    }
    return Response.redirect(
        `https://docs.google.com/spreadsheets/d/${sheets[key]}/edit`,
        302
    );
}