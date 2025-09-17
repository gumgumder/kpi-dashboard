import { NextRequest, NextResponse } from "next/server";
import { sheetsClient } from '@/lib/google/sheets';

export const runtime = "nodejs";


export async function GET(_: NextRequest) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_REV_SPREADSHEET_ID;
    if (!spreadsheetId) return new Response('Missing sheet ID', { status: 500 });

    const range = process.env.GOOGLE_SHEETS_REV_SPREADSHEET_ID_RANGE;
    const sheets = sheetsClient();
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return Response.json({ range, values: data.values ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Google Sheets error: ${msg}`, { status: 502 });
  }
}
