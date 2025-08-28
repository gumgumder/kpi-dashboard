'use client';

import {useEffect, useMemo, useState} from 'react';
import {Card, CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Check, X, Plus} from 'lucide-react';
import clsx from 'clsx';
import {createSupabaseBrowser} from '@/lib/supabaseClient';

type DayStatus = 'none' | 'done' | 'missed' | 'neutral';
type Row = {
    id: string;
    title: string;
    start_date: string; // yyyy-mm-dd
    end_date: string;   // yyyy-mm-dd
    statuses: Record<string, DayStatus>;
};

function iso(d: Date) {
    const z = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    return z.toISOString().slice(0,10);
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

    for (const d of days) {
        const st = statuses[d];
        if (d > today) continue; // ignore future

        if (st === 'done') {
            done++; run++;
        } else if (st === 'neutral') {
            neutral++; run++;       // neutral keeps the streak alive
        } else if (st === 'missed') {
            missed++; run = 0;      // missed breaks streak
        } else {
            // 'none' — skip, don’t break streak, don’t increment
        }
        longestStreak = Math.max(longestStreak, run);
    }

    // compute current streak: walk backwards until a miss or start
    const rev = [...days].reverse();
    currentStreak = 0;
    for (const d of rev) {
        if (d > today) continue;
        const st = statuses[d];
        if (st === 'done' || st === 'neutral') {
            currentStreak++;
        } else if (st === 'missed') {
            break;
        } else if (st === 'none') {
            continue; // skip blanks
        }
    }

    const total = days.filter(d => d <= today).length;

    return { done, missed, neutral, total, currentStreak, longestStreak };
}

export default function DailyInputsTab() {
    const supabase = useMemo(() => createSupabaseBrowser(), []);
    const [items, setItems] = useState<Row[]>([]);
    const [title, setTitle] = useState('');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [loading, setLoading] = useState(true);

    // initial load
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase
                .from('daily_inputs')
                .select('id,title,start_date,end_date,statuses')
                .order('created_at', { ascending: false });
            if (!error && data) {
                setItems(
                    data.map((r: any) => ({
                        id: r.id,
                        title: r.title,
                        start_date: r.start_date,
                        end_date: r.end_date,
                        statuses: r.statuses ?? {},
                    }))
                );
            }
            setLoading(false);
        })();
    }, [supabase]);

    async function addItem() {
        if (!title.trim() || !start || !end) return;
        if (end < start) return;

        const range = daysBetween(start, end);
        const statuses: Record<string, DayStatus> = {};
        range.forEach(d => (statuses[d] = 'none'));

        // optimistic insert
        const temp: Row = {
            id: 'tmp-' + Date.now(),
            title: title.trim(),
            start_date: start,
            end_date: end,
            statuses,
        };
        setItems(prev => [temp, ...prev]);
        setTitle(''); setStart(''); setEnd('');

        const { data, error } = await supabase
            .from('daily_inputs')
            .insert({
                // no user_id on purpose (policy is public; column must allow null or not exist)
                title: temp.title,
                start_date: temp.start_date,
                end_date: temp.end_date,
                statuses: temp.statuses,
            })
            .select('id,title,start_date,end_date,statuses')
            .single();

        if (error || !data) {
            // rollback
            setItems(prev => prev.filter(i => i.id !== temp.id));
            return;
        }

        setItems(prev => [
            {
                id: data.id,
                title: data.title,
                start_date: data.start_date,
                end_date: data.end_date,
                statuses: (data as any).statuses ?? {},
            },
            ...prev.filter(i => i.id !== temp.id),
        ]);
    }

    async function setStatus(id: string, dayISO: string, status: DayStatus) {
        const prevItem = items.find(i => i.id === id);
        if (!prevItem) return;

        const nextStatuses = { ...prevItem.statuses, [dayISO]: status };
        // optimistic
        setItems(prev => prev.map(i => i.id !== id ? i : { ...i, statuses: nextStatuses }));

        const { error } = await supabase
            .from('daily_inputs')
            .update({ statuses: nextStatuses })
            .eq('id', id);

        if (error) {
            // rollback
            setItems(prev => prev.map(i => i.id !== id ? i : prevItem));
        }
    }

    async function removeItem(id: string) {
        const snapshot = items;
        setItems(prev => prev.filter(i => i.id !== id));
        const { error } = await supabase.from('daily_inputs').delete().eq('id', id);
        if (error) setItems(snapshot);
    }

    return (
        <div className="space-y-6">
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

            <div className="space-y-3">
                {loading ? (
                    <div className="text-sm text-slate-500">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="text-sm text-slate-500">No inputs yet. Add one above.</div>
                ) : items.map(it => {
                    const seq = daysBetween(it.start_date, it.end_date);
                    return (
                        <Card key={it.id} className="border-slate-200">
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    {/* LEFT: title + meta + delete */}
                                    <div className="w-64 shrink-0">
                                        <div className="font-medium">{it.title}</div>
                                        <div className="text-xs text-slate-500">
                                            {it.start_date} → {it.end_date} • {seq.length} days
                                        </div>
                                        <div className="mt-2">
                                            <Button variant="outline" size="sm" onClick={() => removeItem(it.id)}>Delete</Button>
                                        </div>
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

                                        {/* Stats below the dots */}
                                        {(() => {
                                            const stats = calcStats(it.statuses);
                                            const pct = stats.total ? (stats.done / stats.total) * 100 : 0;
                                            return (
                                                <div className="mt-3 space-y-1">
                                                    <div className="w-full h-2 bg-slate-200 rounded">
                                                        <div className="h-2 bg-green-400 rounded" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <div className="flex justify-between text-xs text-slate-600">
                                                        <span>{stats.done}/{stats.total} done • {stats.missed} missed • {stats.neutral} neutral</span>
                                                        <span>Streak: {stats.currentStreak} / {stats.longestStreak}</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

function DayDotMenu({
                        status, onSelect, dateISO,
                    }: {status: DayStatus; onSelect: (s: DayStatus) => void; dateISO: string}) {
    const base = "h-6 w-6 rounded-full border flex items-center justify-center shrink-0";
    const cls = {
        none: "bg-slate-200 border-slate-300",
        done: "bg-green-100 border-green-400",
        missed: "bg-red-100 border-red-400",
        neutral: "bg-yellow-100 border-yellow-400", // or grey/blue, up to you
    }[status];

    const icon = status === 'done'   ? <Check className="h-4 w-4" /> :
        status === 'missed' ? <X className="h-4 w-4" /> :
            status === 'neutral'? <span className="text-xs">–</span> :
                null;

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