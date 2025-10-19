// src/lib/outreach/buildPayload.ts
import 'server-only';
import { sheetsClient } from '@/lib/google/sheets';

// ---- (optionally) export shared types used by UI/POST route ----
export type DayRow = { date: string; sums: number[] };
export type WeekAgg = {
    key: string; week: number; year: number; start: string; end: string;
    sums: number[]; days: DayRow[]; statuses: ('red'|'orange'|'yellow'|'green'|'over'|null)[];
};
export type TabAgg = { tab: string; range: string; headersOut: string[]; weeks: WeekAgg[] };
export type ApiAgg = { tabs: TabAgg[]; generatedAt: string };

// ---- paste your constants + helpers here (pure code only) ----
// 0-based indices from A..L for each sheet
const TAB_COLUMN_MAP: Record<string, number[]> = {
    Content:  [0,1,2,3,4,5,6,7,8,9],
    Outreach: [0,1,2,3,4,5,6,7,10], // includes K (UW_Proposals), excludes I,J
    Termine:  [0],
};

// Weekly goals for **base totals** (not J_/A_ parts). Keys must match the visible base label.
const WEEKLY_GOALS: Record<string, number> = {
    // Content
    'Connections': 400,
    'Posts': 14,
    'Comments': 80,

    // Outreach (examples—uncomment/adjust if you want colors there too)
    'LI_Erstnachricht': 180,
    //'FollowUp': 120,
    // 'Calls': 20,
    'UW_Proposals': 15,
};

type Status = 'red' | 'orange' | 'yellow' | 'green' | 'over' | null;

function statusFromPct(pct: number): Status {
    if (!Number.isFinite(pct)) return null;
    if (pct < 0.30) return 'red';
    if (pct < 0.60) return 'orange';
    if (pct < 0.80) return 'yellow';
    if (pct <= 1.00) return 'green';
    return 'over'; // >100%
}

function parseDateDDMMYYYYdots(s: string): Date | null {
    const m = s?.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm)-1, Number(dd));
    return isNaN(+d) ? null : d;
}
function ymd(d: Date) {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
}
function isoWeekYear(date: Date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((+d - +yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week };
}

function goalKeyFromHeader(header: string): string | null {
    // strip "Content:" / "Outreach:" prefixes
    const colon = header.indexOf(':');
    const name = colon >= 0 ? header.slice(colon + 1).trim() : header.trim();

    // if it looks like a part (J_/A_ prefix), do NOT color
    if (/^(J|A)(?:[_\s-]|$)/i.test(name)) return null;

    // if it has explicit part suffixes (shouldn't for totals), also ignore
    if (/(?:[_\s]J|[_\s]A|\(J\)|\(A\))$/i.test(name)) return null;

    // exact key match against WEEKLY_GOALS
    return Object.prototype.hasOwnProperty.call(WEEKLY_GOALS, name) ? name : null;
}

type CacheEntry = { data: ApiAgg; ts: number };
let cache: CacheEntry | null = null;
let inflight: Promise<ApiAgg> | null = null;

const FRESH_TTL_MS = 60_000;      // serve fresh for 60s
const STALE_TTL_MS = 10 * 60_000; // allow stale up to 10 min if Google errors

export async function buildOutreachPayload(force = false): Promise<ApiAgg> {
    const now = Date.now();

    // serve fresh cache
    if (!force && cache && now - cache.ts < FRESH_TTL_MS) return cache.data;

    // coalesce concurrent callers
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const payload = await fetchFromSheets(); // ⤵ your existing logic
            cache = { data: payload, ts: Date.now() };
            return payload;
        } catch (err) {
            // On quota/429/403, serve stale if available
            if (cache && now - cache.ts < STALE_TTL_MS) return cache.data;
            throw err;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

async function fetchFromSheets(): Promise<ApiAgg> {
    const spreadsheetId = process.env.GOOGLE_SHEETS_OUTREACH_SPREADSHEET_ID!;
    const tabs = ['Content','Outreach','Termine'];
    const ranges = tabs.map(t => `${t}!A1:K`);
    const sheets = sheetsClient();
    const { data } = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
    const vrs = data.valueRanges ?? [];

    // --- read + project ---
    const projected: Record<string, { range: string; headers: string[]; rows: string[][] }> = {};
    for (const vr of vrs) {
        const fullRange = vr.range ?? '';
        const tab = fullRange.split('!')[0] || 'Unknown';
        const keep = TAB_COLUMN_MAP[tab] ?? [];
        const values = (vr.values ?? []);
        const proj = keep.length ? values.map(r => keep.map(i => r[i] ?? '')) : values;
        projected[tab] = {
            range: fullRange,
            headers: proj[0] ?? [],
            rows: proj.length > 1 ? proj.slice(1) : [],
        };
    }

    // ---- Merged (Content + Outreach) ----
    // Build header labels (flattened): Content:* then Outreach:*
    const contentHdr = (projected.Content?.headers ?? []).slice(1);   // drop Date
    const outreachHdr = (projected.Outreach?.headers ?? []).slice(1); // drop Date
    const mergedHeadersOut = [
        ...contentHdr.map(h => `Content:${h}`),
        ...outreachHdr.map(h => `Outreach:${h}`),
    ];

    // Index helper to sum numeric cells
    const toNum = (x: unknown) => {
        const n = parseFloat(String(x ?? '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
    };

    // Map by YMD for both tabs
    type Pair = { d: Date; ymd: string; contentNums: number[]; outreachNums: number[] };
    const byDate = new Map<string, Pair>();

    // ingest Content
    for (const r of projected.Content?.rows ?? []) {
        const d = parseDateDDMMYYYYdots(r[0] ?? '');
        if (!d) continue;
        const key = ymd(d);
        if (!byDate.has(key)) byDate.set(key, { d, ymd: key, contentNums: Array(contentHdr.length).fill(0), outreachNums: Array(outreachHdr.length).fill(0) });
        const p = byDate.get(key)!;
        for (let i = 0; i < contentHdr.length; i++) p.contentNums[i] += toNum(r[i+1]);
    }
    // ingest Outreach
    for (const r of projected.Outreach?.rows ?? []) {
        const d = parseDateDDMMYYYYdots(r[0] ?? '');
        if (!d) continue;
        const key = ymd(d);
        if (!byDate.has(key)) byDate.set(key, { d, ymd: key, contentNums: Array(contentHdr.length).fill(0), outreachNums: Array(outreachHdr.length).fill(0) });
        const p = byDate.get(key)!;
        for (let i = 0; i < outreachHdr.length; i++) p.outreachNums[i] += toNum(r[i+1]);
    }

    // group to weeks + compute weekly sums + attach days
    const mergedWeeksMap = new Map<string, { year:number; week:number; start:Date; end:Date; sums:number[]; days:DayRow[] }>();
    const flattened = Array.from(byDate.values()).sort((a,b)=> +a.d - +b.d);
    for (const p of flattened) {
        const { year, week } = isoWeekYear(p.d);
        const wk = `${year}-W${String(week).padStart(2,'0')}`;
        if (!mergedWeeksMap.has(wk)) {
            mergedWeeksMap.set(wk, {
                year, week, start: p.d, end: p.d,
                sums: Array(mergedHeadersOut.length).fill(0),
                days: [],
            });
        }
        const g = mergedWeeksMap.get(wk)!;
        if (p.d < g.start) g.start = p.d;
        if (p.d > g.end) g.end = p.d;

        const dayNums = [...p.contentNums, ...p.outreachNums];
        g.days.push({ date: p.ymd, sums: dayNums });

        for (let i = 0; i < dayNums.length; i++) g.sums[i] += dayNums[i];
    }

    // finalize weeks with rounding + statuses
    // src/app/api/outreach/route.ts (updated fragment)
    const mergedWeeks: WeekAgg[] = Array.from(mergedWeeksMap.values())
        .sort((a,b)=> a.year-b.year || a.week-b.week)
        .map(w => {
            const sumsRounded = w.sums.map(x => Number.isInteger(x) ? x : Math.round(x*100)/100);
            const currentWeek = isoWeekYear(new Date());
            const isFutureWeek = (w.year > currentWeek.year) || (w.year === currentWeek.year && w.week > currentWeek.week);
            // statuses aligned to headersOut: only weeks strictly after the current week are null
            const statuses = mergedHeadersOut.map((hdr, i) => {
                const key = goalKeyFromHeader(hdr);
                if (!key) return null;
                const goal = WEEKLY_GOALS[key];
                if (!goal) return null;
                if (isFutureWeek) return null;
                const val = sumsRounded[i] ?? 0;
                return statusFromPct(val / goal);
            });
            return {
                key: `${w.year}-W${String(w.week).padStart(2,'0')}`,
                week: w.week, year: w.year,
                start: ymd(w.start), end: ymd(w.end),
                sums: sumsRounded,
                days: w.days.map(d => ({
                    date: d.date,
                    sums: d.sums.map(x => Number.isInteger(x) ? x : Math.round(x*100)/100),
                })),
                statuses,
            };
        });

    const mergedTab: TabAgg = {
        tab: 'Merged',
        range: `${projected.Content?.range || ''} | ${projected.Outreach?.range || ''}`,
        headersOut: mergedHeadersOut,
        weeks: mergedWeeks,
    };

    // ---- Termine (pass-through weekly buckets, no numeric columns unless you add some) ----
    const termineTab: TabAgg = {
        tab: 'Termine',
        range: projected.Termine?.range || '',
        headersOut: [],
        weeks: [], // extend if Termine needs numbers later
    };

    return {
        tabs: [mergedTab, termineTab],
        generatedAt: new Date().toISOString(),
    };
}
