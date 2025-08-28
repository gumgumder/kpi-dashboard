'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import clsx from 'clsx';
import { createSupabaseBrowser } from '@/lib/supabaseClient';
import { Check, X, Plus, Flame, Crown } from 'lucide-react';

type DayStatus = 'none' | 'done' | 'missed' | 'neutral';

type Row = {
    id: string;
    title: string;
    start_date: string; // yyyy-mm-dd
    end_date: string;   // yyyy-mm-dd
    statuses: Record<string, DayStatus>;
};

const toRow = (r: DbDailyInput): Row => ({
    id: r.id,
    title: r.title,
    start_date: r.start_date,
    end_date: r.end_date,
    statuses: (r.statuses ?? {}) as Record<string, DayStatus>,
});

type DbDailyInput = {
    id: string;
    title: string;
    start_date: string;
    end_date: string;
    statuses: Record<string, DayStatus> | null;
};

function iso(d: Date) {
    const z = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    return z.toISOString().slice(0, 10);
}

function daysBetween(startISO: string, endISO: string): string[] {
    const s = new Date(startISO + 'T00:00:00Z');
    const e = new Date(endISO + 'T00:00:00Z');
    const out: string[] = [];
    for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) out.push(iso(d));
    return out;
}

function calcStats(statuses: Record<string, DayStatus>) {
    const days = Object.keys(statuses).sort(); // yyyy-mm-dd asc
    const today = new Date().toISOString().slice(0, 10);

    let done = 0, missed = 0, neutral = 0;
    let longestStreak = 0, currentStreak = 0, run = 0;
    let elapsed = 0;

    for (const d of days) {
        const st = statuses[d];
        if (d > today) continue;                   // ignore future
        if (st !== 'none') elapsed++;              // any selection counts as "passed"
        if (st === 'done')        { done++;   run++; }
        else if (st === 'neutral'){ neutral++; run++; } // neutral keeps streak
        else if (st === 'missed') { missed++; run = 0; } // missed breaks streak
        longestStreak = Math.max(longestStreak, run);
    }

    // current streak: walk backward until a miss
    const rev = [...days].reverse();
    for (const d of rev) {
        if (d > today) continue;
        const st = statuses[d];
        if (st === 'done' || st === 'neutral') currentStreak++;
        else if (st === 'missed') break;
        // 'none' → skip
    }

    const total = days.length;
    const remaining = Math.max(0, total - elapsed);
    return { done, missed, neutral, total, elapsed, remaining, currentStreak, longestStreak };
}

export default function DailyInputsTab() {
    const supabase = useMemo(() => createSupabaseBrowser(), []);
    const [items, setItems] = useState<Row[]>([]);
    const [title, setTitle] = useState('');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [loading, setLoading] = useState(true);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editStart, setEditStart] = useState('');
    const [editEnd, setEditEnd] = useState('');

    // initial load
    useEffect(() => {
        (async () => {
            const res = await supabase
                .from('daily_inputs')
                .select('id,title,start_date,end_date,statuses')
                .order('created_at', { ascending: false });
            if (!res.error && res.data) setItems(res.data.map(d => toRow(d as DbDailyInput)));
            setLoading(false);
        })();
    }, [supabase]);

    async function addItem() {
        if (!title.trim() || !start || !end) return;
        if (end < start) return;

        const range = daysBetween(start, end);
        const statuses: Record<string, DayStatus> = {};
        range.forEach(d => (statuses[d] = 'none'));

        const temp: Row = {
            id: 'tmp-' + Date.now().toString(),
            title: title.trim(),
            start_date: start,
            end_date: end,
            statuses,
        };

        setItems((prev: Row[]) => [temp, ...prev]);
        setTitle(''); setStart(''); setEnd('');

        const res = await supabase
            .from('daily_inputs')
            .insert({
                title: temp.title,
                start_date: temp.start_date,
                end_date: temp.end_date,
                statuses: temp.statuses,
            })
            .select('id,title,start_date,end_date,statuses')
            .single(); // <- no .returns()

        if (res.error || !res.data) {
            setItems((prev: Row[]) => prev.filter(i => i.id !== temp.id));
            return;
        }

        const newRow = toRow(res.data as DbDailyInput);
        setItems((prev: Row[]) => [newRow, ...prev.filter(i => i.id !== temp.id)]);
    }

    async function setStatus(id: string, dayISO: string, status: DayStatus) {
        const prevItem = items.find(i => i.id === id);
        if (!prevItem) return;

        const nextStatuses: Record<string, DayStatus> = { ...prevItem.statuses, [dayISO]: status };

        // optimistic update
        setItems((prev: Row[]) =>
            prev.map(i => (i.id !== id ? i : { ...i, statuses: nextStatuses }))
        );

        const { error } = await supabase
            .from('daily_inputs')
            .update({ statuses: nextStatuses })
            .eq('id', id);

        if (error) {
            // rollback on failure
            setItems((prev: Row[]) => prev.map(i => (i.id !== id ? i : prevItem)));
        }
    }

    async function updateItem(id: string) {
        if (!editTitle.trim() || !editStart || !editEnd || editEnd < editStart) return;

        const row = items.find(i => i.id === id);
        if (!row) return;

        // Recompute range + statuses, preserving overlaps
        const newRange = daysBetween(editStart, editEnd);
        const newStatuses: Record<string, DayStatus> = {};
        for (const d of newRange) newStatuses[d] = row.statuses[d] ?? 'none';

        const prev = row;
        const next: Row = { ...row, title: editTitle.trim(), start_date: editStart, end_date: editEnd, statuses: newStatuses };

        // optimistic
        setItems((list: Row[]) => list.map(i => (i.id === id ? next : i)));

        const { error } = await supabase
            .from('daily_inputs')
            .update({
                title: next.title,
                start_date: next.start_date,
                end_date: next.end_date,
                statuses: next.statuses,
            })
            .eq('id', id);

        if (error) {
            setItems((list: Row[]) => list.map(i => (i.id === id ? prev : i)));
            alert(error.message);
            return;
        }
        setEditingId(null);
    }

    async function removeItem(id: string) {
        const snapshot = items;
        setItems(prev => prev.filter(i => i.id !== id));
        const { error } = await supabase.from('daily_inputs').delete().eq('id', id);
        if (error) setItems(snapshot);
    }

    return (
        <div className="space-y-6">
            {/* Creator */}
            <Card className="border-slate-200">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-end gap-3">
                        <div className="flex-1">
                            <label className="text-sm text-slate-600">Input name</label>
                            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Post on LinkedIn" />
                        </div>
                        <div>
                            <label className="text-sm text-slate-600">Start</label>
                            <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm text-slate-600">Goal date</label>
                            <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
                        </div>
                        <Button onClick={addItem} className="shrink-0">
                            <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">Range is inclusive.</div>
                </CardContent>
            </Card>

            {/* Rows */}
            <div className="space-y-3">
                {loading ? (
                    <div className="text-sm text-slate-500">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="text-sm text-slate-500">No inputs yet. Add one above.</div>
                ) : (
                    items.map(it => {
                        const seq = daysBetween(it.start_date, it.end_date);
                        return (
                            <Card key={it.id} className="border-slate-200">
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-3">
                                        {/* LEFT: title / meta / actions */}
                                        <div className="w-64 shrink-0">
                                            {editingId === it.id ? (
                                                <div className="space-y-2">
                                                    <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                                                    <Input type="date" value={editStart} onChange={e => setEditStart(e.target.value)} />
                                                    <Input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
                                                    <div className="flex gap-2">
                                                        <Button size="sm" onClick={() => updateItem(it.id)}>Save</Button>
                                                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="font-medium">{it.title}</div>
                                                    <div className="text-xs text-slate-500">
                                                        {it.start_date} → {it.end_date} • {seq.length} days
                                                    </div>
                                                    <div className="mt-2 flex gap-2">
                                                        <Button variant="outline" size="sm" onClick={() => removeItem(it.id)}>Delete</Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => {
                                                                setEditingId(it.id);
                                                                setEditTitle(it.title);
                                                                setEditStart(it.start_date);
                                                                setEditEnd(it.end_date);
                                                            }}
                                                        >
                                                            Edit
                                                        </Button>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* RIGHT: dots + stats */}
                                        <div className="flex-1 overflow-x-auto">
                                            <div className="flex items-center gap-2 min-w-max">
                                                {seq.map(d => (
                                                    <DayDotMenu
                                                        key={d}
                                                        status={it.statuses[d] ?? 'none'}
                                                        onSelect={(s) => setStatus(it.id, d, s)}
                                                        dateISO={d}
                                                    />
                                                ))}
                                            </div>

                                            {/* Stats under dots */}
                                            {(() => {
                                                const s = calcStats(it.statuses);
                                                const pctElapsed = s.total ? (s.elapsed / s.total) * 100 : 0;
                                                return (
                                                    <div className="mt-3 space-y-2">
                                                        <div className="w-full h-2 bg-slate-200 rounded overflow-hidden">
                                                            <div className="h-2 bg-sky-400" style={{ width: `${pctElapsed}%` }} />
                                                        </div>
                                                        <div className="flex justify-between text-xs text-slate-600">
                                                            <span>{s.elapsed}/{s.total} days passed • {s.remaining} to go</span>
                                                            <span>{s.done}/{s.total} done • {s.missed} missed • {s.neutral} neutral</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 text-orange-700 px-2 py-0.5 text-xs">
                                <Flame className="h-3 w-3" /> Current streak: {s.currentStreak}
                              </span>
                                                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 text-violet-700 px-2 py-0.5 text-xs">
                                <Crown className="h-3 w-3" /> Longest streak: {s.longestStreak}
                              </span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function DayDotMenu({
                        status, onSelect, dateISO,
                    }: { status: DayStatus; onSelect: (s: DayStatus) => void; dateISO: string }) {
    const base = "h-6 w-6 rounded-full border flex items-center justify-center shrink-0";
    const cls = {
        none: "bg-slate-200 border-slate-300",
        done: "bg-green-100 border-green-400",
        missed: "bg-red-100 border-red-400",
        neutral: "bg-yellow-100 border-yellow-400",
    }[status];

    const icon =
        status === 'done'   ? <Check className="h-4 w-4" /> :
            status === 'missed' ? <X className="h-4 w-4" /> :
                status === 'neutral'? <span className="text-xs">–</span> : null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className={clsx(base, cls)} title={dateISO} aria-label={`Set status for ${dateISO}`}>
                    {icon}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => onSelect('done')}>
                    <Check className="h-4 w-4 mr-2" /> Done ({dateISO})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSelect('missed')}>
                    <X className="h-4 w-4 mr-2" /> Missed ({dateISO})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSelect('neutral')}>
                    <span className="mr-2">–</span> Neutral ({dateISO})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSelect('none')}>Clear</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}