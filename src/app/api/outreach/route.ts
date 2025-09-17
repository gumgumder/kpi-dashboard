import { sheetsClient } from '@/lib/google/sheets';

export async function GET() {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEETS_OUTREACH_SPREADSHEET_ID;
        if (!spreadsheetId) return new Response('Missing sheet ID', { status: 500 });

        const range = process.env.OUTREACH_RANGE || 'Overview!A1:G'; // put your tab here
        const sheets = sheetsClient();
        const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        return Response.json({ range, values: data.values ?? [] });
    } catch (err: unknown) {
        const msg =
            typeof err === 'object' && err && 'message' in err
                ? String((err as { message?: unknown }).message)
                : 'Failed to load sheet';
        return new Response(msg, { status: 500 });
    }
}
