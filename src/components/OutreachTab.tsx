// app/(dashboard)/kpi/outreach/page.tsx
'use client';
import { useEffect, useState, useCallback, JSX } from 'react';
import { getGoalsForWeek } from '@/lib/weeklyGoals';

type Status = 'red' | 'orange' | 'yellow' | 'green' | 'over' | null;

type WeekAgg = {
    key: string; week: number; year: number; start: string; end: string;
    sums: number[];             // weekly totals (GLOBAL order per headersOut)
    days: { date: string; sums: number[] }[]; // daily totals (same GLOBAL order)
    statuses: Status[];         // NEW: per-column weekly status, aligned to headersOut
};
type TabAgg = {
    tab: string; range: string; headers: string[]; headersOut: string[]; weeks: WeekAgg[];
};
type ApiAgg = { tabs: TabAgg[]; generatedAt: string };

// ---------- label helpers ----------
const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, ' ').trim();
type Part = 'J' | 'A' | null;

function stripPrefix(h: string) {
    const i = h.indexOf(':');
    return i >= 0 ? h.slice(i + 1).trim() : h.trim();
}

function getCurrentWeekId(): number {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((+d - +yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() * 100 + week; // same scheme as backend
}

const CURRENT_WEEK_ID = getCurrentWeekId();

function detectPart(name: string): Part {
    const n = name.trim();
    if (/^J(?:[_\s-]|$)/i.test(n)) return 'J';
    if (/^A(?:[_\s-]|$)/i.test(n)) return 'A';
    if (/_J$/i.test(n) || /\sJ$/i.test(n) || /\(J\)$/i.test(n)) return 'J';
    if (/_A$/i.test(n) || /\sA$/i.test(n) || /\(A\)\s*$/i.test(n)) return 'A';
    return null;
}
function baseName(name: string) {
    let n = name.trim();
    n = n.replace(/^J(?:[_\s-])?/i, '').replace(/^A(?:[_\s-])?/i, '');
    n = n
        .replace(/_J$/i, '').replace(/_A$/i, '')
        .replace(/\sJ$/i, '').replace(/\sA$/i, '')
        .replace(/\s*\(J\)\s*$/i, '').replace(/\s*\(A\)\s*$/i, '');
    return n.trim();
}

// Build part index with normalized keys
function buildPartIndex(headersOut: string[]) {
    const map: Record<string, { J?: number; A?: number }> = {};
    headersOut.forEach((h, i) => {
        const name = stripPrefix(h);
        const part = detectPart(name);
        const base = baseName(name);
        const key = norm(base);
        if (!map[key]) map[key] = {};
        if (part === 'J') map[key].J = i;
        if (part === 'A') map[key].A = i;
    });
    return map;
}

// Robust resolver: aliases + fallback contains-scan
function resolvePartsRobust(
    baseRaw: string,
    partIdx: Record<string, { J?: number; A?: number }>,
    headersOut: string[]
) {
    const aliases = [baseRaw, `LI ${baseRaw}`, `${baseRaw} LI`];
    for (const raw of aliases) {
        const key = norm(raw);
        if (partIdx[key]) return partIdx[key];
    }
    // Fallback scan
    const want = norm(baseRaw);
    let J: number | undefined;
    let A: number | undefined;
    headersOut.forEach((h, i) => {
        const name = stripPrefix(h);
        const part = detectPart(name);
        if (!part) return;
        const b = norm(baseName(name));
        if (b.includes(want)) {
            if (part === 'J') J = i;
            if (part === 'A') A = i;
        }
    });
    return { J, A };
}

// ---------- selection & projection ----------
function buildSelectedIndices(headersOut: string[]) {
    const contentIdxs: number[] = [];
    const outreachIdxs: number[] = [];
    headersOut.forEach((h, i) => {
        if (h.startsWith('Content:')) contentIdxs.push(i);
        else if (h.startsWith('Outreach:')) outreachIdxs.push(i);
    });

    // Content: exactly Connections, Posts, Comments (base totals)
    const contentWants = ['Connections', 'Posts', 'Comments'].map(norm);
    const pickContent = contentIdxs
        .filter(i => detectPart(stripPrefix(headersOut[i]!)) === null
            && contentWants.includes(norm(stripPrefix(headersOut[i]!))))
        .sort((a, b) =>
            contentWants.indexOf(norm(stripPrefix(headersOut[a]!))) -
            contentWants.indexOf(norm(stripPrefix(headersOut[b]!)))
        );

    // Outreach: exactly LI_Erstnachricht, LI_FollowUp, Calls, UW_Proposals (base totals)
    const outreachWants = ['LI_Erstnachricht', 'LI_FollowUp', 'Calls', 'UW_Proposals'].map(norm);
    const pickOutreach = outreachIdxs
        .filter(i => detectPart(stripPrefix(headersOut[i]!)) === null
            && outreachWants.includes(norm(stripPrefix(headersOut[i]!))))
        .sort((a, b) =>
            outreachWants.indexOf(norm(stripPrefix(headersOut[a]!))) -
            outreachWants.indexOf(norm(stripPrefix(headersOut[b]!)))
        );

    const selected = [...pickContent, ...pickOutreach];
    return selected.length ? selected : headersOut.map((_, i) => i);
}

function projectToSelected<T extends number | string>(arr: T[], idx: number[]) {
    return idx.map(i => arr[i] as T);
}
function projectStatuses(arr: Status[] | undefined, idx: number[]) {
    return idx.map(i => (arr && i < arr.length ? arr[i] ?? null : null));
}

function toDeRange(aYmd: string, bYmd: string) {
    const [ay, am, ad] = aYmd.split('-').map(Number);
    const [by, bm, bd] = bYmd.split('-').map(Number);
    const a = new Date(ay, am - 1, ad);
    const b = new Date(by, bm - 1, bd);
    const m = (dt: Date) => dt.toLocaleString('de-AT', { month: 'short' }).replace('.', '');
    const sameM = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    return sameM
        ? `${a.getDate()}–${b.getDate()} ${m(a)} ${a.getFullYear()}`
        : `${a.getDate()} ${m(a)} ${a.getFullYear()} – ${b.getDate()} ${m(b)} ${b.getFullYear()}`;
}

// Badge class for weekly overview (uses backend status)
function badgeClass(status: Status, strong = false) {
    const common = 'inline-flex px-2 py-0.5 rounded text-xs font-bold';
    if (!status) return strong ? `${common} bg-slate-200 text-slate-900` : 'text-slate-700 font-bold text-xs';
    switch (status) {
        case 'red':    return `${common} bg-red-200 text-red-900`;
        case 'orange': return `${common} bg-orange-200 text-orange-900`;
        case 'yellow': return `${common} bg-yellow-200 text-yellow-900`;
        case 'green':  return `${common} bg-green-200 text-green-900`;
        case 'over': return `${common} bg-emerald-800 text-emerald-50`;
        default:       return strong ? `${common} bg-slate-200 text-slate-900` : 'text-slate-700 font-bold text-xs';
    }
}

export default function OutreachTab() {
    const [data, setData] = useState<ApiAgg | null>(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [showAll, setShowAll] = useState(false);

    const currentGoals = getGoalsForWeek(CURRENT_WEEK_ID);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/outreach', { cache: 'no-store' });
            if (!res.ok) throw new Error(await res.text());
            const json: ApiAgg = await res.json();
            setData(json);

            // default expand current ISO week
            const now = new Date();
            const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const week = Math.ceil((((+d - +yearStart) / 86400000) + 1) / 7);
            const currentKey = `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;

            const next: Record<string, boolean> = {};
            for (const t of json.tabs || []) {
                const hasCurrent = t.weeks.some(w => w.key === currentKey);
                t.weeks.forEach((w, idx) => {
                    const k = `${t.tab}:${w.key}`;
                    next[k] = hasCurrent ? w.key === currentKey : idx === t.weeks.length - 1;
                });
            }
            setExpanded(next);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">
                    Updated: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString('de-AT') : '—'}
                </div>
                <div className="flex gap-2">
                    <button onClick={load} className="text-sm px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50" disabled={loading}>
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <button
                        onClick={() => setShowAll(v => !v)}
                        className="text-sm px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50"
                        aria-pressed={showAll}
                        title={showAll ? 'Show compact values' : 'Show Total - J | A'}
                    >
                        {showAll ? 'Compact values' : 'Expand info'}
                    </button>
                    <a
                        href="/api/sheet-link?doc=outreach"
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm px-3 py-1.5 rounded-md border bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    >
                        Edit in Google Sheets
                    </a>
                </div>
            </div>

            <div className="mt-3">
                <div className="p-3 bg-white rounded shadow-sm">
                    <div className="text-xs text-slate-500 mb-2">
                        Weekly goals (current week)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1 text-sm">
                        {Object.entries(currentGoals).map(([label, val]) => (
                            <div key={label} className="flex items-center gap-2">
                                <span className="text-slate-700 truncate">{label}</span>
                                <span className="font-medium text-slate-900 mr-4">{val}</span>
                            </div>
                        ))}
                        {Object.keys(currentGoals).length === 0 && (
                            <div className="text-xs text-slate-500">
                                No goals defined for this week.
                            </div>
                        )}
                    </div>
                </div>
            </div>


            {(data?.tabs?.length ?? 0) === 0 && (
                <div className="overflow-x-auto rounded-lg border w-full">
                    <div className="px-3 py-6 text-slate-500 text-sm">No data</div>
                </div>
            )}

            {data?.tabs?.map((t) => {
                const selectedIdx = buildSelectedIndices(t.headersOut);
                const headersShown = projectToSelected(t.headersOut, selectedIdx);
                const partIndex = buildPartIndex(t.headersOut); // normalized keys

                const renderWeeklyCell = (
                    colPos: number,
                    displayed: number[],
                    original: number[],
                    status: Status
                ) => {
                    const origIdx = selectedIdx[colPos];
                    const baseRaw = baseName(stripPrefix(t.headersOut[origIdx]));
                    const total = displayed[colPos] ?? 0;

                    // always strong so weekly cells use filled/status styling consistently
                    const cls = badgeClass(status, /*strong=*/ true);

                    if (!showAll) {
                        return (
                            <span className={cls}>
                {Number.isInteger(total) ? total : total.toFixed(2)}
            </span>
                        );
                    }

                    const parts = resolvePartsRobust(baseRaw, partIndex, t.headersOut);
                    const hasJ = typeof parts.J === 'number';
                    const hasA = typeof parts.A === 'number';

                    if (!(hasJ || hasA)) {
                        return (
                            <span className={cls}>
                {Number.isInteger(total) ? total : total.toFixed(2)}
            </span>
                        );
                    }

                    const jVal = hasJ ? (original[parts.J!] ?? 0) : 0;
                    const aVal = hasA ? (original[parts.A!] ?? 0) : 0;

                    return (
                        <span className={cls}>
            {(Number.isInteger(total) ? total : total.toFixed(2))} - {(Number.isInteger(jVal) ? jVal : jVal.toFixed(2))} | {(Number.isInteger(aVal) ? aVal : aVal.toFixed(2))}
        </span>
                    );
                };

                const renderDailyCell = (colPos: number, displayed: number[], original: number[]) => {
                    const origIdx = selectedIdx[colPos];
                    const baseRaw = baseName(stripPrefix(t.headersOut[origIdx]));
                    const total = displayed[colPos] ?? 0;

                    if (!showAll) {
                        return <span className="text-slate-700 text-xs font-medium">
              {Number.isInteger(total) ? total : total.toFixed(2)}
            </span>;
                    }

                    const parts = resolvePartsRobust(baseRaw, partIndex, t.headersOut);
                    const hasJ = typeof parts.J === 'number';
                    const hasA = typeof parts.A === 'number';

                    if (!(hasJ || hasA)) {
                        return <span className="text-slate-700 text-xs font-medium">
              {Number.isInteger(total) ? total : total.toFixed(2)}
            </span>;
                    }

                    const jVal = hasJ ? (original[parts.J!] ?? 0) : 0;
                    const aVal = hasA ? (original[parts.A!] ?? 0) : 0;

                    return <span className="text-slate-700 text-xs font-medium">
            {(Number.isInteger(total) ? total : total.toFixed(2))} - {(Number.isInteger(jVal) ? jVal : jVal.toFixed(2))} | {(Number.isInteger(aVal) ? aVal : aVal.toFixed(2))}
          </span>;
                };

                return (
                    <div key={t.tab} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">{t.tab}</div>
                            <div className="text-xs text-slate-500">{t.range || '—'}</div>
                        </div>

                        <div className="overflow-x-auto rounded-lg border w-full">
                            <table className="min-w-full w-full text-sm">
                                <thead className="bg-slate-100">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium text-slate-700 border-b w-1/3">Woche</th>
                                    {headersShown.map((h, i) => (
                                        <th key={`${i}-${h}`} className="px-3 py-2 text-center font-medium text-slate-700 border-b">
                                            {stripPrefix(h)}
                                        </th>
                                    ))}
                                </tr>
                                </thead>
                                <tbody>
                                {t.weeks.length === 0 && (
                                    <tr>
                                        <td className="px-3 py-6 text-slate-500" colSpan={(headersShown.length || 0) + 1}>No data</td>
                                    </tr>
                                )}
                                {t.weeks.map((w, idx) => {
                                    const zebra = idx % 2 === 0 ? 'bg-white' : 'bg-slate-100';
                                    const k = `${t.tab}:${w.key}`;
                                    const isOpen = !!expanded[k];
                                    const rangeShort = toDeRange(w.start, w.end);

                                    const weekNumsDisplayed = projectToSelected(w.sums, selectedIdx);
                                    const weekStatusesDisplayed = projectStatuses(w.statuses, selectedIdx);

                                    const rows: JSX.Element[] = [];

                                    // summary row
                                    rows.push(
                                        <tr key={`${k}-summary`} className={`${zebra} border-b align-middle`}>
                                            <td className="px-3 py-2 font-semibold text-slate-800">
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={() => setExpanded(s => ({ ...s, [k]: !s[k] }))}
                                                        className="px-2 py-1 rounded-md border hover:bg-slate-50 text-xs"
                                                        aria-expanded={isOpen}
                                                        aria-controls={`week-${k}`}
                                                    >
                                                        {isOpen ? '▾' : '▸'}
                                                    </button>
                                                    <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-700 text-white text-xs">
                              {`KW ${w.week}`}
                            </span>
                                                    <span className="text-slate-600 text-xs">{rangeShort}</span>
                                                </div>
                                            </td>
                                            {headersShown.map((_, i) => (
                                                <td key={`${k}-sum-${i}`} className="px-3 py-2 text-center">
                                                    {renderWeeklyCell(i, weekNumsDisplayed, w.sums, weekStatusesDisplayed[i] ?? null)}
                                                </td>
                                            ))}
                                        </tr>
                                    );

                                    // expanded: daily rows (neutral colors)
                                    if (isOpen && w.days?.length > 0) {
                                        w.days.forEach((d, di) => {
                                            const dayNumsDisplayed = projectToSelected(d.sums, selectedIdx);
                                            rows.push(
                                                <tr key={`${k}-day-${di}`} className={`${zebra} border-b`}>
                                                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                                                        {new Date(d.date).toLocaleDateString('de-AT', {
                                                            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
                                                        })}
                                                    </td>
                                                    {headersShown.map((_, i) => (
                                                        <td key={`${k}-daycell-${di}-${i}`} className="px-3 py-2 text-center">
                                                            {renderDailyCell(i, dayNumsDisplayed, d.sums)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        });
                                    }

                                    return rows; // tbody children: only <tr>
                                })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
