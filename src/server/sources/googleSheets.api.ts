// src/server/sources/googleSheets.api.ts
import 'server-only';
import { getSheetsClient } from './googleSheets.client';

export type ValuesResponse = { range: string; values: (string | number)[][] };

const SHEETS_BY_YEAR: Record<string, string | undefined> = {
    '2025': process.env.GOOGLE_SHEETS_KPI_NUMBERS_2025_ID,
    '2026': process.env.GOOGLE_SHEETS_KPI_NUMBERS_2026_ID,
};

function getSpreadsheetId(year: string) {
    const id = SHEETS_BY_YEAR[year];
    if (!id) throw new Error(`Missing sheet ID for year ${year}`);
    return id;
}

export async function getRevenueValues(year: string): Promise<ValuesResponse> {
    const spreadsheetId = getSpreadsheetId(year);
    const range = 'Revenue';

    const sheets = getSheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
    });

    return { range, values: (data.values ?? []) as any };
}