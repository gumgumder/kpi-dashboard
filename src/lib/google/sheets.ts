// lib/google/sheets.ts
import { google, sheets_v4 } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

export function getCreds() {
    const json = process.env.SERVICE_ACCOUNT_KEY;
    if (!json) throw new Error('Missing SERVICE_ACCOUNT_KEY');
    const parsed = JSON.parse(json);
    const key = String(parsed.private_key).includes('\\n')
        ? String(parsed.private_key).replace(/\\n/g, '\n')
        : parsed.private_key;
    return { client_email: parsed.client_email as string, private_key: key as string };
}

export function sheetsClient(): sheets_v4.Sheets {
    const { client_email, private_key } = getCreds();
    const auth = new google.auth.GoogleAuth({ credentials: { client_email, private_key }, scopes: SCOPES });
    return google.sheets({ version: 'v4', auth });
}