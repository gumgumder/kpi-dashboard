// src/app/api/google-sheets/route.ts
import 'server-only';
import { NextResponse } from "next/server";
import { sheetsClient } from '@/lib/google/sheets';

export const runtime = "nodejs";

type ValuesResponse = { range: string; values: (string | number)[][] };

const SHEETS_BY_YEAR: Record<string, string | undefined> = {
  '2025': process.env.GOOGLE_SHEETS_KPI_NUMBERS_2025_ID,
  '2026': process.env.GOOGLE_SHEETS_KPI_NUMBERS_2026_ID,
};

const FRESH_TTL_MS = Number(process.env.FRESH_TTL_MS)
const STALE_TTL_MS = Number(process.env.STALE_TTL_MS);

type CacheEntry = { data: ValuesResponse; ts: number };
const cacheByYear = new Map<string, CacheEntry>();
const inflightByYear = new Map<string, Promise<ValuesResponse>>();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') ?? String(new Date().getFullYear());

  const spreadsheetId = SHEETS_BY_YEAR[year];
  if (!spreadsheetId) {
    return new NextResponse(`Missing sheet ID for year ${year}`, { status: 500 });
  }

  const now = Date.now();
  const cached = cacheByYear.get(year);
  if (cached && now - cached.ts < FRESH_TTL_MS) {
    return NextResponse.json(cached.data, { headers: { 'Cache-Control': 'no-store' } });
  }

  const inflight = inflightByYear.get(year);
  if (inflight) {
    const data = await inflight;
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  }

  const p = (async () => {
    try {
      const range = 'Revenue';
      const sheets = sheetsClient();
      const { data } = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
      });

      const payload: ValuesResponse = { range, values: (data.values ?? []) as any };
      cacheByYear.set(year, { data: payload, ts: Date.now() });
      return payload;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const stale = cacheByYear.get(year);
      if (stale && now - stale.ts < STALE_TTL_MS) return stale.data;
      throw new Error(`Google Sheets error: ${msg}`);
    } finally {
      inflightByYear.delete(year);
    }
  })();

  inflightByYear.set(year, p);

  try {
    const data = await p;
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(msg, { status: 502 });
  }
}