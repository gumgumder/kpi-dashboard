// app/api/sheet-link/route.ts
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
    const id = process.env.GOOGLE_SHEETS_REV_SPREADSHEET_ID;
    if (!id) {
        return new Response('Not found', { status: 404 });
    }
    return Response.redirect(`https://docs.google.com/spreadsheets/d/${id}/edit`, 302);
}