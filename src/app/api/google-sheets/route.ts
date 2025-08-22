import { NextRequest, NextResponse } from "next/server";
import { google, sheets_v4 } from "googleapis";

export const runtime = "nodejs";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

// ENV (server-only, no NEXT_PUBLIC)
const SHEET_ID = process.env.GOOGLE_SHEETS_REV_SPREADSHEET_ID!;
const SHEET_RANGE = process.env.GOOGLE_SHEETS_REV_SPREADSHEET_ID_RANGE;

function getCreds() {
  const json = process.env.SERVICE_ACCOUNT_KEY;
  if (!json) throw new Error("Missing SERVICE_ACCOUNT_KEY");
  const parsed = JSON.parse(json);
  const key = String(parsed.private_key).includes("\\n")
      ? String(parsed.private_key).replace(/\\n/g, "\n")
      : parsed.private_key;
  return { client_email: parsed.client_email, private_key: key };
}

function sheetsClient(): sheets_v4.Sheets {
  const { client_email, private_key } = getCreds();
  const auth = new google.auth.GoogleAuth({ credentials: { client_email, private_key }, scopes: SCOPES });
  return google.sheets({ version: "v4", auth });
}

export async function GET(_req: NextRequest) {
  try {
    if (!SHEET_ID) return NextResponse.json({ error: "Missing GOOGLE_SHEETS_REV_SPREADSHEET_ID" }, { status: 500 });
    const res = await sheetsClient().spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
    const values = (res.data.values as string[][]) ?? [];
    return NextResponse.json(
        { range: res.data.range || SHEET_RANGE, values },
        { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Google Sheets error: ${msg}`, { status: 502 });
  }
}
