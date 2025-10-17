// src/app/api/google-sheets/route.ts
import { NextResponse } from "next/server";
import { sheetsClient } from '@/lib/google/sheets';

export const runtime = "nodejs";

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_OUTREACH_SPREADSHEET_ID;
    if (!spreadsheetId) return new NextResponse('Missing sheet ID', { status: 500 });

    const range = 'Revenue'; // look at the "Revenue" tab
    const sheets = sheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    return NextResponse.json({ range, values: data.values ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Google Sheets error: ${msg}`, { status: 502 });
  }
}