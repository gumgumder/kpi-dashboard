'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ---- module cache (persists until hard reload) ----
let NOTION_STATS_CACHE: VideoStats | null = null;

// ---- types & constants ----
type VideoStats = {
    total: number;
    byStatus: Record<string, number>;
    itemsByStatus: Record<string, string[]>;
    lastUpdated?: string | null;
};

const ALLOWED_STATUSES = [
    'Internal Review',
    'Ready for Filming',
    'Filmed',
    'Editing-Jakob',
    'Editing',
    'Scheduled',
] as const;
type Status = typeof ALLOWED_STATUSES[number];

const STATUS_STYLES: Record<Status, string> = {
    'Internal Review': 'bg-blue-50 border-blue-200',
    'Ready for Filming': 'bg-yellow-50 border-yellow-200',
    Filmed: 'bg-green-50 border-green-200',
    'Editing-Jakob': 'bg-amber-50 border-amber-200',
    Editing: 'bg-red-50 border-red-200',
    Scheduled: 'bg-blue-50 border-blue-200',
};

const TZ = 'Europe/Vienna';

function viennaTodayUTC(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date());
    const y = Number(parts.find(p => p.type === 'year')?.value);
    const m = Number(parts.find(p => p.type === 'month')?.value);
    const d = Number(parts.find(p => p.type === 'day')?.value);
    return new Date(Date.UTC(y, m - 1, d)); // Vienna midnight in UTC
}

const daysUntil = (iso: string): number => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 0;
    const [y, m, d] = iso.split('-').map(Number);
    const start = viennaTodayUTC();
    const end = new Date(Date.UTC(y, m - 1, d));
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
};

const endOfCurrentMonthISO = () => {
    const start = viennaTodayUTC();
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    return end.toISOString().slice(0, 10); // YYYY-MM-DD
};

const formatGoal = (iso: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-GB', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric' });
};


// ---- component ----
export default function ShortVideosTab() {
    const [stats, setStats] = useState<VideoStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [goalDate, setGoalDate] = useState<string>(endOfCurrentMonthISO());

    const load = async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api');
            if (!res.ok) throw new Error(await res.text());
            const json = (await res.json()) as VideoStats;
            // normalize
            const filled: Record<string, string[]> = { ...(json.itemsByStatus || {}) };
            Object.keys(json.byStatus || {}).forEach(k => { if (!filled[k]) filled[k] = []; });
            const next = { ...json, itemsByStatus: filled };
            NOTION_STATS_CACHE = next;
            setStats(next);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load stats');
        } finally {
            setLoading(false);
        }
    };

    // first mount: use cache if present; otherwise fetch
    useEffect(() => {
        if (NOTION_STATS_CACHE) setStats(NOTION_STATS_CACHE);
        else void load();
    }, []);

    // preload saved goal date from server
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/app-settings/goal-date');
                if (res.ok) {
                    const { value } = await res.json();
                    if (value) setGoalDate(value);
                }
            } catch {/* noop */}
        })();
    }, []);

    const totalShown = stats
        ? ALLOWED_STATUSES.reduce((acc, s) => acc + (stats.byStatus?.[s] ?? 0), 0)
        : 0;
    const totalExclScheduled = stats
        ? ALLOWED_STATUSES.filter(s => s !== 'Scheduled')
            .reduce((acc, s) => acc + (stats.byStatus?.[s] ?? 0), 0)
        : 0;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Short Videos</h2>
                <div className="flex gap-2 items-center">
                    <Input
                        type="date"
                        value={goalDate}
                        onChange={async (e) => {
                            const v = e.target.value;
                            setGoalDate(v);
                            try {
                                await fetch('/api/app-settings/goal-date', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ value: v }),
                                });
                            } catch (err) {
                                // keep silent in UI
                                console.error('Saving goal date failed', err);
                            }
                        }}
                        className="h-9 w-auto"
                    />
                    <Button variant="secondary" onClick={load} disabled={loading}>
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </Button>
                </div>
            </div>

            {error && (
                <Card><CardContent className="p-4 text-sm text-red-600">
                    {error}
                    <div className="text-slate-600 mt-2">
                        Check <code>src/app/api/route.ts</code> (Notion) and <code>src/app/api/app-settings/goal-date/route.ts</code>.
                    </div>
                </CardContent></Card>
            )}

            {!error && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card><CardContent className="p-4">
                            <div className="text-slate-500 text-sm">Goal Date</div>
                            <div className="text-lg font-semibold mb-1">{formatGoal(goalDate)}</div>
                            <div className="text-sm text-slate-600">
                                Needed videos (days left): <span className="font-bold">{daysUntil(goalDate)}</span>
                            </div>
                        </CardContent></Card>

                        <Card><CardContent className="p-4">
                            <div className="text-slate-500 text-sm">Totals</div>
                            <div className="text-sm">All statuses: <span className="font-semibold">{stats ? totalShown : (loading ? '…' : 0)}</span></div>
                            <div className="text-sm">Excl. Scheduled: <span className="font-semibold">{stats ? totalExclScheduled : (loading ? '…' : 0)}</span></div>
                            <div className="text-sm">To be scripted: <span className="font-semibold">
                {Math.max(0, daysUntil(goalDate) - (stats ? totalShown : 0))}
              </span></div>
                        </CardContent></Card>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
                        {ALLOWED_STATUSES.map((status) => (
                            <Card key={status} className={`${STATUS_STYLES[status]} shadow-sm`}>
                                <CardContent className="p-3">
                                    <div className="flex items-baseline justify-between mb-2">
                                        <div className="text-xs font-medium text-slate-600">{status}</div>
                                        <div className="text-xl font-bold">{stats?.byStatus?.[status] ?? 0}</div>
                                    </div>
                                    <div className="max-h-48 overflow-auto pr-1">
                                        {(stats?.itemsByStatus?.[status] || []).length ? (
                                            <ul className="space-y-1">
                                                {stats!.itemsByStatus[status].map((id) => (
                                                    <li key={id} className="text-xs rounded bg-slate-50 border border-slate-200 px-2 py-1 truncate">
                                                        {id}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-xs text-slate-500">No items.</div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}