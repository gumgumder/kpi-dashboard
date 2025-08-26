'use client';

import {useEffect, useMemo, useState} from 'react';
import {Card, CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {Progress} from '@/components/ui/progress';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {Plus, Edit} from 'lucide-react';
import {createSupabaseBrowser} from '@/lib/supabaseClient';

// ---- Types ----
interface KPI {
    id: number | string;
    title: string;
    current: number;
    target: number;
    unit?: string;
    parentId?: number | string | null;
    period?: string; // YYYY-MM for monthly KPIs
}

interface MonthlyRow {
    id: number | string;
    title: string;
    unit: string | null;
    target: number | string;
    current: number | string;
    period?: string | null;
}

interface WeeklyRow {
    id: number | string;
    parent_id: number | string;
    title: string;
    unit: string | null;
    target: number | string;
    current: number | string;
}

interface MonthlyUpsert {
    id?: number | string;
    title: string;
    unit?: string;
    target: number;
    current: number;
    period?: string;
}

type MonthlyInsert = Omit<MonthlyUpsert, 'id'>;

interface WeeklyUpsert {
    id?: number | string;
    parent_id: number;
    title: string;
    unit?: string;
    target: number;
    current: number;
}

type WeeklyInsert = Omit<WeeklyUpsert, 'id'>;

// ---- Long-term types ----
interface LTGoal {
    id: number | string;
    title: string;
    unit: string;
    target_total: number;
    start_month: string; // YYYY-MM
    end_month: string;   // YYYY-MM
    notes?: string | null;
}

interface LTFuel {
    id: number | string;
    lt_goal_id: number | string;
    period: string;          // YYYY-MM
    monthly_kpi_id: number | string;
    weight: number;
    mode: 'current' | 'target' | 'both';
}

// computed for render
type LTCheckpoint = { period: string; current: number; target: number; };
type LTRow = {
    goal: LTGoal;
    checkpoints: LTCheckpoint[];      // one per month in range
    totalCurrent: number;
    totalTarget: number;
};

// ---- UI helpers ----
const progressBarClass = (p: number) => {
    if (p >= 1.0) return '[&>div]:bg-green-700';
    if (p >= 0.8) return '[&>div]:bg-green-500';
    if (p >= 0.6) return '[&>div]:bg-yellow-400';
    if (p >= 0.25) return '[&>div]:bg-orange-400';
    return '[&>div]:bg-red-500';
};
const textColor = (p: number) => {
    if (p >= 1.0) return 'text-green-700';
    if (p >= 0.8) return 'text-green-600';
    if (p >= 0.6) return 'text-yellow-600';
    if (p >= 0.25) return 'text-orange-600';
    return 'text-red-600';
};
const formatPeriodLabel = (period?: string) => {
    if (!period) return '';
    const [y, m] = period.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    // stable between server/client
    return d.toLocaleString('en-GB', {month: 'long', year: 'numeric'});
};

const currentYM = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

// ---- Long-term helpers ----
const normalizePeriod = (p?: string) => {
    if (!p) return '';
    const [y, m] = p.split('-');
    if (!y || !m) return '';
    return `${y}-${String(Number(m)).padStart(2, '0')}`;
};
const monthsBetween = (startYM: string, endYM: string) => {
    const out: string[] = [];
    const [sy, sm] = startYM.split('-').map(Number);
    const [ey, em] = endYM.split('-').map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m++;
        if (m > 12) {
            m = 1;
            y++;
        }
    }
    return out;
};
const monthShort = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-GB', {month: 'short'});
};
const pct = (num: number, den: number) =>
    Math.max(0, Math.min(100, (num / (den || 1)) * 100));

const MilestoneDot = ({pct}: { pct: number }) => {
    const clamped = Math.max(0, Math.min(100, pct));
    // partially filled circle via conic-gradient
    return (
        <div
            className="h-5 w-5 rounded-full border border-slate-300"
            style={{
                backgroundImage: `conic-gradient(var(--dot-fill) ${clamped}%, transparent ${clamped}%)`,
                // fallback color; Tailwind CSS var injected via parent
            }}
            aria-label={`${Math.round(clamped)}%`}
            title={`${Math.round(clamped)}%`}
        />
    );
};

export default function KPITab() {
    const supabase = useMemo(() => createSupabaseBrowser(), []);
    const [kpis, setKpis] = useState<KPI[]>([]);
    const [loading, setLoading] = useState(true);
    const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
    const [selectedPeriod, setSelectedPeriod] = useState<string>('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [editing, setEditing] = useState<KPI | null>(null);
    const [isWeekly, setIsWeekly] = useState(false);
    const [hasPeriod, setHasPeriod] = useState(true);
    const [form, setForm] = useState({
        title: '', current: '', target: '', unit: '', parentId: '', period: '',
    });
    // ---- Long-term state ----
    const [ltGoals, setLtGoals] = useState<LTGoal[]>([]);
    const [ltFuels, setLtFuels] = useState<LTFuel[]>([]);
    const [ltDialogOpen, setLtDialogOpen] = useState(false);
    const [editingLT, setEditingLT] = useState<LTGoal | null>(null);

    // dynamic fuel rows in dialog
    type FuelForm = {
        id?: number | string;
        period: string;
        monthly_kpi_id: string;
        weight: string;
        mode: 'both' | 'current' | 'target'
    };
    const [ltForm, setLtForm] = useState<{
        title: string; unit: string; target_total: string; start_month: string; end_month: string; notes?: string;
        fuels: FuelForm[];
    }>({title: '', unit: '', target_total: '', start_month: currentYM(), end_month: currentYM(), notes: '', fuels: []});

    const [errors, setErrors] = useState<{
        title?: string;
        current?: string;
        target?: string;
        period?: string;
        parentId?: string
    }>({});

    // ---- Supabase helpers ----
    const fetchKpis = async () => {
        setLoading(true);
        let monthlyRows: MonthlyRow[] = [];
        let weeklyRows: WeeklyRow[] = [];
        let hasPeriodColumn = true;

        const {data: monthlyWithPeriod, error: mErr} = await supabase
            .from('kpi_monthly').select('id,title,unit,target,current,period').order('id');

        if (mErr && (mErr as { code?: string }).code === '42703') {
            hasPeriodColumn = false;
            const {data: monthlyNoPeriod, error: mErr2} = await supabase
                .from('kpi_monthly').select('id,title,unit,target,current').order('id');
            if (mErr2) {
                console.error(mErr2);
                setLoading(false);
                return;
            }
            monthlyRows = (monthlyNoPeriod ?? []) as unknown as MonthlyRow[];
        } else if (mErr) {
            console.error(mErr);
            setLoading(false);
            return;
        } else {
            monthlyRows = (monthlyWithPeriod ?? []) as unknown as MonthlyRow[];
        }

        const {data: weekly, error: wErr} = await supabase
            .from('kpi_weekly').select('id,parent_id,title,unit,target,current').order('id');
        if (wErr) {
            console.error(wErr);
            setLoading(false);
            return;
        }
        weeklyRows = (weekly ?? []) as unknown as WeeklyRow[];

        const mappedMonthly: KPI[] = monthlyRows.map(m => ({
            id: m.id, title: m.title, unit: m.unit ?? '', target: Number(m.target) ?? 0,
            current: Number(m.current) ?? 0, parentId: null, period: m.period ?? undefined,
        }));
        const mappedWeekly: KPI[] = weeklyRows.map(w => ({
            id: w.id, title: w.title, unit: w.unit ?? '', target: Number(w.target) ?? 0,
            current: Number(w.current) ?? 0, parentId: w.parent_id,
        }));

        if (hasPeriodColumn) {
            const uniq = Array.from(new Set((monthlyRows ?? [])
                .map(r => r.period).filter(Boolean) as string[])).sort();
            setAvailablePeriods(uniq);
            setSelectedPeriod(prev => (prev && uniq.includes(prev)) ? prev : (uniq[uniq.length - 1] ?? currentYM()));
        }
        setHasPeriod(hasPeriodColumn);   // <- set state once, after using local flag
        setKpis([...mappedMonthly, ...mappedWeekly]);
        setLoading(false);
    };

    // --- Effective monthly values (sum weeklies if present) ---
    const weeklyAggByParent = useMemo(() => {
        const mp = new Map<string, { current: number; target: number }>();
        kpis.forEach(k => {
            if (k.parentId == null) return;
            const key = String(k.parentId);
            const prev = mp.get(key) ?? { current: 0, target: 0 };
            mp.set(key, { current: prev.current + (k.current || 0), target: prev.target + (k.target || 0) });
        });
        return mp;
    }, [kpis]);

    const monthlyEffById = useMemo(() => {
        const mp = new Map<number | string, { current: number; target: number; unit: string; period?: string }>();
        const parents = kpis.filter(k => k.parentId == null);
        parents.forEach(m => {
            const agg = weeklyAggByParent.get(String(m.id));
            mp.set(Number(m.id), {
                current: agg ? agg.current : m.current,
                target: agg ? agg.target : m.target,
                unit: m.unit ?? '',
                period: m.period,
            });
        });
        return mp;
    }, [kpis, weeklyAggByParent]);

    const upsertMonthly = async (payload: MonthlyUpsert) => {
        const {
            data,
            error
        } = await supabase.from('kpi_monthly').upsert(payload, {onConflict: 'id'}).select().maybeSingle();
        if (error) throw error;
        return data as MonthlyRow | null;
    };
    const insertMonthly = async (payload: MonthlyInsert) => {
        const {data, error} = await supabase.from('kpi_monthly').insert(payload).select().maybeSingle();
        if (error) throw error;
        return data as MonthlyRow | null;
    };
    const upsertWeekly = async (payload: WeeklyUpsert) => {
        const {
            data,
            error
        } = await supabase.from('kpi_weekly').upsert(payload, {onConflict: 'id'}).select().maybeSingle();
        if (error) throw error;
        return data as WeeklyRow | null;
    };
    const insertWeekly = async (payload: WeeklyInsert) => {
        const {data, error} = await supabase.from('kpi_weekly').insert(payload).select().maybeSingle();
        if (error) throw error;
        return data as WeeklyRow | null;
    };
    const deleteMonthly = async (id: number | string) => {
        const {error} = await supabase.from('kpi_monthly').delete().eq('id', Number(id));
        if (error) throw error;
    };
    const deleteWeekly = async (id: number | string) => {
        const {error} = await supabase.from('kpi_weekly').delete().eq('id', Number(id));
        if (error) throw error;
    };
    const incrementWeekly = async (id: number | string, currentVal: number) => {
        try {
            const {error} = await supabase.from('kpi_weekly').update({current: currentVal + 1}).eq('id', Number(id));
            if (error) throw error;
            await fetchKpis();
        } catch (e) {
            console.error(e);
            alert('Increment failed.');
        }
    };

    const allMonthly = kpis.filter(k => k.parentId === null || k.parentId === undefined);
    const monthly = hasPeriod
        ? allMonthly.filter(m => m.period === selectedPeriod)
        : allMonthly;
    const weekly = kpis.filter(k => k.parentId !== null && k.parentId !== undefined);

    // ---- Long-term Supabase helpers ----
    const fetchLongTerm = async () => {
        const [{data: goals, error: gErr}, {data: fuels, error: fErr}] = await Promise.all([
            supabase.from('long_term_goals').select('id,title,unit,target_total,start_month,end_month,notes').order('id'),
            supabase.from('lt_goal_fuels').select('id,lt_goal_id,period,monthly_kpi_id,weight,mode').order('lt_goal_id').order('period'),
        ]);
        if (gErr) {
            console.error(gErr);
            return;
        }
        if (fErr) {
            console.error(fErr);
            return;
        }
        setLtGoals((goals ?? []) as unknown as LTGoal[]);
        setLtFuels((fuels ?? []) as unknown as LTFuel[]);
    };

    const upsertLTGoal = async (payload: Partial<LTGoal> & { id?: number | string }) => {
        const {
            data,
            error
        } = await supabase.from('long_term_goals').upsert(payload, {onConflict: 'id'}).select().maybeSingle();
        if (error) throw error;
        return data as LTGoal | null;
    };
    const replaceLTFuels = async (lt_goal_id: number | string, fuels: FuelForm[]) => {
        // delete then insert
        const del = await supabase.from('lt_goal_fuels').delete().eq('lt_goal_id', Number(lt_goal_id));
        if (del.error) throw del.error;
        if (!fuels.length) return;
        const inserts = fuels.map(f => ({
            lt_goal_id: Number(lt_goal_id),
            period: normalizePeriod(f.period),
            monthly_kpi_id: Number(f.monthly_kpi_id),
            weight: Number(f.weight || 1),
            mode: f.mode ?? 'both',
        }));
        const {error} = await supabase.from('lt_goal_fuels').insert(inserts);
        if (error) throw error;
    };

    // ---- Lifecycle ----
    useEffect(() => {
        fetchKpis();
        fetchLongTerm();
    }, []);

    const ltRows: LTRow[] = useMemo(() => {
        return ltGoals.map(goal => {
            const range = monthsBetween(normalizePeriod(goal.start_month), normalizePeriod(goal.end_month));
            const fuelsForGoal = ltFuels.filter(f => String(f.lt_goal_id) === String(goal.id));

            const monthAgg = new Map<string, { current: number; target: number }>();
            range.forEach(p => monthAgg.set(p, { current: 0, target: 0 }));

            for (const f of fuelsForGoal) {
                const p = normalizePeriod(f.period);
                if (!monthAgg.has(p)) continue;
                const eff = monthlyEffById.get(Number(f.monthly_kpi_id));
                if (!eff) continue;
                const w = Number.isFinite(Number(f.weight)) ? Number(f.weight) : 1;
                const addCur = (f.mode === 'target') ? 0 : w * (eff.current || 0);
                const addTar = (f.mode === 'current') ? 0 : w * (eff.target || 0);
                const prev = monthAgg.get(p)!;
                monthAgg.set(p, { current: prev.current + addCur, target: prev.target + addTar });
            }

            const checkpoints = range.map(period => ({ period, ...(monthAgg.get(period) ?? { current: 0, target: 0 }) }));
            const totalCurrent = checkpoints.reduce((s, c) => s + c.current, 0);
            // show the explicit LT target (e.g., 80), not the sum of month targets
            const totalTarget = Math.max(1, Number(goal.target_total) || 0);
            return { goal, checkpoints, totalCurrent, totalTarget };
        });
    }, [ltGoals, ltFuels, monthlyEffById]);

    // ---- Dialog helpers ----
    const openNew = (weekly: boolean) => {
        setEditing(null);
        setIsWeekly(weekly);
        setForm({
            title: '', current: '', target: '', unit: '', parentId: '',
            period: (!weekly && hasPeriod) ? (selectedPeriod || currentYM()) : ''
        });
        setIsDialogOpen(true);
    };
    const openEdit = (kpi: KPI) => {
        setEditing(kpi);
        setIsWeekly(!!kpi.parentId);
        setForm({
            title: kpi.title, current: String(kpi.current), target: String(kpi.target),
            unit: kpi.unit ?? '', parentId: kpi.parentId ? String(kpi.parentId) : '', period: kpi.period ?? '',
        });
        setIsDialogOpen(true);
    };

    const save = async () => {
        const {title, current, target, unit, parentId, period} = form;

        if (!validate()) return;
        try {
            if (isWeekly) {
                const parent = monthly.find(m => String(m.id) === String(parentId));
                const parentUnit = parent?.unit ?? '';
                const childUnit = unit || '';
                if (parentUnit !== childUnit) {
                    alert(`Unit mismatch. Weekly must match '${parentUnit || '—'}'.`);
                    return;
                }
                await upsertWeekly({
                    id: editing?.id, parent_id: Number(parentId), title, unit: childUnit,
                    current: Number(current), target: Number(target),
                });
            } else {
                const payload: MonthlyUpsert = {
                    id: editing?.id, title, unit: unit || '', current: Number(current), target: Number(target),
                    ...(hasPeriod ? {period} : {})
                };
                await upsertMonthly(payload);
            }
            await fetchKpis();
            setIsDialogOpen(false);
        } catch (e) {
            console.error(e);
            alert('Saving failed.');
        }
    };

    const confirmDelete = async () => {
        if (!editing) return;
        try {
            if (editing.parentId !== null && editing.parentId !== undefined) await deleteWeekly(editing.id);
            else await deleteMonthly(editing.id);
            setConfirmOpen(false);
            setIsDialogOpen(false);
            await fetchKpis();
        } catch (e) {
            console.error(e);
            alert('Delete failed.');
        }
    };

    const duplicateEditing = async () => {
        if (!editing) return;
        try {
            if (editing.parentId !== null && editing.parentId !== undefined) {
                await insertWeekly({
                    parent_id: Number(editing.parentId),
                    title: `Copy of ${editing.title}`, unit: editing.unit || '',
                    target: Number(editing.target), current: Number(editing.current),
                });
            } else {
                const newMonthly = await insertMonthly({
                    title: `Copy of ${editing.title}`, unit: editing.unit || '',
                    target: Number(editing.target), current: Number(editing.current),
                    ...(editing.period ? {period: editing.period} : {}),
                });
                if (!newMonthly) throw new Error('Monthly duplicate failed');
                const {data: children, error: cErr} = await supabase
                    .from('kpi_weekly').select('id,parent_id,title,unit,target,current')
                    .eq('parent_id', Number(editing.id));
                if (cErr) throw cErr;
                const inserts: WeeklyInsert[] = ((children as WeeklyRow[]) || []).map(wk => ({
                    parent_id: Number(newMonthly.id),
                    title: `Copy of ${wk.title}`, unit: wk.unit ?? '',
                    target: Number(wk.target) ?? 0, current: Number(wk.current) ?? 0,
                }));
                if (inserts.length) {
                    const {error: bulkErr} = await supabase.from('kpi_weekly').insert(inserts);
                    if (bulkErr) throw bulkErr;
                }
            }
            await fetchKpis();
            setIsDialogOpen(false);
        } catch (e) {
            console.error(e);
            alert('Duplicate failed.');
        }
    };

    const validate = () => {
        const e: { title?: string; current?: string; target?: string; period?: string; parentId?: string } = {};
        const isMonthly = !isWeekly;

        if (!form.title.trim()) e.title = 'Title is required.';
        if (form.current === '') e.current = 'Current value is required.';
        if (form.target === '') e.target = 'Target value is required.';
        if (isWeekly && !form.parentId) e.parentId = 'Select a parent KPI.';
        if (isMonthly && hasPeriod && !form.period) e.period = 'Month is required.';

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    // ---- Render ----
    return (
        <div className="space-y-4">
            {/* Long-Term Goals */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Long-Term Goals</h2>
                    <Button onClick={() => {
                        setEditingLT(null);
                        setLtForm({
                            title: '',
                            unit: '',
                            target_total: '',
                            start_month: currentYM(),
                            end_month: currentYM(),
                            notes: '',
                            fuels: [],
                        });
                        setLtDialogOpen(true);
                    }}>Add LT Goal</Button>
                </div>

                {ltRows.length === 0 ? (
                    <div className="text-slate-500 text-sm">No long-term goals yet.</div>
                ) : (
                    <div className="space-y-4">
                        {ltRows.map(row => {
                            const cumPct = pct(row.totalCurrent, row.totalTarget);
                            return (
                                <div key={row.goal.id} className="rounded-lg border p-3 bg-white shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="font-semibold">{row.goal.title}</div>
                                        <div className="text-sm font-medium text-slate-700">
                                            {row.goal.unit}{row.totalCurrent.toLocaleString()}{" "}
                                            <span className="text-slate-400">/</span>{" "}
                                            {row.goal.unit}{row.totalTarget.toLocaleString()}
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <div
                                            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded bg-slate-200"/>
                                        <div
                                            className="absolute left-0 top-1/2 -translate-y-1/2 h-[6px] rounded bg-green-600 transition-all"
                                            style={{width: `${cumPct}%`}}/>

                                        <div className="relative grid"
                                             style={{gridTemplateColumns: `repeat(${row.checkpoints.length}, minmax(0,1fr))`}}>
                                            {row.checkpoints.map(cp => (
                                                <div key={cp.period} className="flex flex-col items-center gap-1">
                                                    <MilestoneDot pct={pct(cp.current, cp.target)}/>
                                                    <div
                                                        className="text-xs text-slate-600">{monthShort(cp.period)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mt-2 flex items-center justify-between">
                                        <div className="text-xs text-slate-500">
                                            {formatPeriodLabel(row.goal.start_month)} – {formatPeriodLabel(row.goal.end_month)}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => {
                                                // open edit dialog with populated fields
                                                setEditingLT(row.goal);
                                                setLtForm({
                                                    title: row.goal.title,
                                                    unit: row.goal.unit,
                                                    target_total: String(row.goal.target_total),
                                                    start_month: normalizePeriod(row.goal.start_month),
                                                    end_month: normalizePeriod(row.goal.end_month),
                                                    notes: row.goal.notes ?? '',
                                                    fuels: ltFuels
                                                        .filter(f => String(f.lt_goal_id) === String(row.goal.id))
                                                        .map(f => ({
                                                            id: f.id,
                                                            period: normalizePeriod(f.period),
                                                            monthly_kpi_id: String(f.monthly_kpi_id),
                                                            weight: String(f.weight ?? 1),
                                                            mode: f.mode ?? 'both',
                                                        })),
                                                });
                                                setLtDialogOpen(true);
                                            }}>Edit</Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
            <header className="flex items-center justify-between">
                {hasPeriod && (
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-600">Showing period:</span>
                        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                            <SelectTrigger className="w-[220px]">
                                <SelectValue placeholder="Select month"/>
                            </SelectTrigger>
                            <SelectContent>
                                {availablePeriods.map(p => (
                                    <SelectItem key={p} value={p}>{formatPeriodLabel(p)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="text-xs text-slate-500">
                            {formatPeriodLabel(selectedPeriod)}
                        </div>
                    </div>
                )}
                <h2 className="text-xl font-semibold">Monthly KPIs</h2>
                <div className="flex gap-2">
                    <Button onClick={() => openNew(false)} className="gap-2"><Plus size={18}/>Monthly KPI</Button>
                    <Button variant="secondary" onClick={() => openNew(true)} className="gap-2"><Plus size={18}/>Weekly
                        KPI</Button>
                </div>
            </header>

            {loading ? (
                <div className="text-slate-500">Loading…</div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {monthly.map(kpi => {
                        const children = weekly.filter(w => String(w.parentId) === String(kpi.id));
                        const derivedCurrent = children.length ? children.reduce((s, c) => s + c.current, 0) : kpi.current;
                        const progress = derivedCurrent / (kpi.target || 1);
                        return (
                            <Card key={String(kpi.id)} className="shadow-md">
                                <CardContent className="px-4 pb-4 pt-2 space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div className="font-semibold leading-snug">
                                            {kpi.period && (
                                                <div className="mt-0 mb-2">
                          <span
                              className="inline-block rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-0.5 border border-indigo-100">
                            {formatPeriodLabel(kpi.period)}
                          </span>
                                                </div>
                                            )}
                                            <div>{kpi.title}</div>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(kpi)}><Edit
                                            size={16}/></Button>
                                    </div>

                                    <div className={`text-2xl font-bold tracking-tight ${textColor(progress)}`}>
                                        {kpi.unit}{derivedCurrent.toLocaleString()}{" "}
                                        <span className="text-base font-medium text-slate-500">
                      / {kpi.unit}{kpi.target.toLocaleString()}
                    </span>
                                    </div>
                                    <Progress value={Math.min(progress * 100, 100)}
                                              className={`h-2 ${progressBarClass(progress)}`}/>

                                    {children.length > 0 && (
                                        <div className="space-y-3 pt-2">
                                            {children.map(wk => {
                                                const wp = wk.current / (wk.target || 1);
                                                return (
                                                    <div
                                                        key={String(wk.id)}
                                                        className={`pl-2 border-l border-slate-200${wp >= 1 ? ' kpi-glow' : ''}`}>
                                                        <div className="flex items-start justify-between">
                                                            <span className="text-sm font-medium">{wk.title}</span>
                                                            <div className="flex items-center gap-1">
                                                                <Button variant="outline"
                                                                        className="h-6 w-6 px-0 text-xs"
                                                                        onClick={() => incrementWeekly(wk.id, wk.current)}>+1</Button>
                                                                <Button variant="ghost" size="icon"
                                                                        onClick={() => openEdit(wk)}><Edit
                                                                    size={14}/></Button>
                                                            </div>
                                                        </div>
                                                        <div className={`text-sm font-semibold ${textColor(wp)}`}>
                                                            {wk.unit}{wk.current} / {wk.unit}{wk.target}
                                                        </div>
                                                        <Progress value={Math.min(wp * 100, 100)}
                                                                  className={`h-1.5 ${progressBarClass(wp)}`}/>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Dialog */}
            <Dialog open={ltDialogOpen} onOpenChange={setLtDialogOpen}>
                <DialogContent className="sm:max-w-3xl w-[900px]">
                    <DialogHeader>
                        <DialogTitle>{editingLT ? 'Edit Long-Term Goal' : 'Add Long-Term Goal'}</DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Title</label>
                            <Input className="col-span-3" value={ltForm.title}
                                   onChange={e => setLtForm(f => ({...f, title: e.target.value}))}/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Unit</label>
                            <Input className="col-span-3" value={ltForm.unit}
                                   onChange={e => setLtForm(f => ({...f, unit: e.target.value}))}/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Target total</label>
                            <Input type="number" className="col-span-3" value={ltForm.target_total}
                                   onChange={e => setLtForm(f => ({...f, target_total: e.target.value}))}/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Start month</label>
                            <Input type="month" className="col-span-3" value={ltForm.start_month}
                                   onChange={e => setLtForm(f => ({
                                       ...f,
                                       start_month: normalizePeriod(e.target.value)
                                   }))}/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">End month</label>
                            <Input type="month" className="col-span-3" value={ltForm.end_month}
                                   onChange={e => setLtForm(f => ({
                                       ...f,
                                       end_month: normalizePeriod(e.target.value)
                                   }))}/>
                        </div>

                        {/* Fuels */}
                        <div className="mt-2">
                            <div className="flex items-center justify-between">
                                <div className="font-medium">Fuels (month → monthly KPI)</div>
                                <Button variant="secondary" size="sm" onClick={() => setLtForm(f => ({
                                    ...f,
                                    fuels: [...f.fuels, {
                                        period: normalizePeriod(ltForm.start_month),
                                        monthly_kpi_id: '',
                                        weight: '1',
                                        mode: 'both'
                                    }]
                                }))}>Add Fuel</Button>
                            </div>

                            <div className="mt-2 space-y-2">
                                {ltForm.fuels.map((fuel, idx) => {
                                    const period = normalizePeriod(fuel.period);
                                    const monthOptions = monthsBetween(ltForm.start_month, ltForm.end_month);
                                    const monthlyForPeriod = allMonthly
                                        .filter(m => normalizePeriod(m.period) === period)
                                        .map(m => {
                                            const eff = monthlyEffById.get(Number(m.id))!;
                                            return { m, eff };
                                        });

                                    return (
                                        <div key={idx} className="grid grid-cols-12 gap-3 items-end border rounded p-3">
                                            <div className="col-span-12 sm:col-span-3">
                                                <label className="text-xs text-slate-500">Month</label>
                                                <Select
                                                    value={period}
                                                    onValueChange={(v) =>
                                                        setLtForm(f => {
                                                            const fuels = [...f.fuels];
                                                            fuels[idx] = { ...fuels[idx], period: v };
                                                            return { ...f, fuels };
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                                                    <SelectContent>
                                                        {monthOptions.map(p => (
                                                            <SelectItem key={p} value={p}>{formatPeriodLabel(p)}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="col-span-12 sm:col-span-5">
                                                <label className="text-xs text-slate-500">Monthly KPI</label>
                                                <Select
                                                    value={String(fuel.monthly_kpi_id)}
                                                    onValueChange={(v) =>
                                                        setLtForm(f => {
                                                            const fuels = [...f.fuels];
                                                            fuels[idx] = { ...fuels[idx], monthly_kpi_id: v };
                                                            return { ...f, fuels };
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger><SelectValue placeholder="Select KPI" /></SelectTrigger>
                                                    <SelectContent>
                                                        {monthlyForPeriod.length === 0 ? (
                                                            <SelectItem value="__none" disabled>No KPIs in this month</SelectItem>
                                                        ) : monthlyForPeriod.map(({ m, eff }) => (
                                                            <SelectItem key={String(m.id)} value={String(m.id)}>
                                                                {m.title} ({m.unit}{eff.current} / {m.unit}{eff.target})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="col-span-6 sm:col-span-2">
                                                <label className="text-xs text-slate-500">Weight</label>
                                                <Input
                                                    type="number" step="0.1" value={fuel.weight}
                                                    onChange={(e) =>
                                                        setLtForm(f => {
                                                            const fuels = [...f.fuels];
                                                            fuels[idx] = { ...fuels[idx], weight: e.target.value };
                                                            return { ...f, fuels };
                                                        })
                                                    }
                                                />
                                            </div>

                                            <div className="col-span-6 sm:col-span-1">
                                                <label className="text-xs text-slate-500">Mode</label>
                                                <Select
                                                    value={fuel.mode}
                                                    onValueChange={(v: any) =>
                                                        setLtForm(f => {
                                                            const fuels = [...f.fuels];
                                                            fuels[idx] = { ...fuels[idx], mode: v };
                                                            return { ...f, fuels };
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="both">both</SelectItem>
                                                        <SelectItem value="current">current</SelectItem>
                                                        <SelectItem value="target">target</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="col-span-12 sm:col-span-1 flex justify-end">
                                                <Button
                                                    variant="ghost"
                                                    onClick={() =>
                                                        setLtForm(f => {
                                                            const fuels = [...f.fuels];
                                                            fuels.splice(idx, 1);
                                                            return { ...f, fuels };
                                                        })
                                                    }
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setLtDialogOpen(false)}>Cancel</Button>
                        <Button onClick={async () => {
                            // minimal validation
                            if (!ltForm.title.trim()) return alert('Title required');
                            if (!ltForm.target_total) return alert('Target total required');
                            if (ltForm.fuels.some(f => !f.period || !f.monthly_kpi_id)) return alert('Each fuel needs month and KPI');

                            try {
                                const payload = {
                                    id: editingLT?.id,
                                    title: ltForm.title,
                                    unit: ltForm.unit ?? '',
                                    target_total: Number(ltForm.target_total),
                                    start_month: normalizePeriod(ltForm.start_month),
                                    end_month: normalizePeriod(ltForm.end_month),
                                    notes: ltForm.notes ?? null
                                };
                                const saved = await upsertLTGoal(payload);
                                if (!saved) throw new Error('Save failed');
                                await replaceLTFuels(saved.id, ltForm.fuels);
                                await fetchLongTerm();
                                setLtDialogOpen(false);
                            } catch (e) {
                                console.error(e);
                                alert('Saving LT goal failed.');
                            }
                        }}>{editingLT ? 'Save' : 'Add'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild></DialogTrigger>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>{editing ? 'Edit KPI' : isWeekly ? 'Add Weekly KPI' : 'Add Monthly KPI'}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Title</label>
                            <Input
                                value={form.title}
                                onChange={(e) => {
                                    setForm({...form, title: e.target.value});
                                    if (errors.title) setErrors(s => ({...s, title: undefined}));
                                }}
                                className={`col-span-3 ${errors.title ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            />
                            {errors.title &&
                                <p className="col-span-3 col-start-2 text-xs text-red-600">{errors.title}</p>}
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Current</label>
                            <Input
                                type="number"
                                value={form.current}
                                onChange={(e) => {
                                    setForm({...form, current: e.target.value});
                                    if (errors.current) setErrors(s => ({...s, current: undefined}));
                                }}
                                className={`col-span-3 ${errors.current ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            />
                            {errors.current &&
                                <p className="col-span-3 col-start-2 text-xs text-red-600">{errors.current}</p>}
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Target</label>
                            <Input
                                type="number"
                                value={form.target}
                                onChange={(e) => {
                                    setForm({...form, target: e.target.value});
                                    if (errors.target) setErrors(s => ({...s, target: undefined}));
                                }}
                                className={`col-span-3 ${errors.target ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            />
                            {errors.target &&
                                <p className="col-span-3 col-start-2 text-xs text-red-600">{errors.target}</p>}
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Unit</label>
                            <Input value={form.unit} onChange={(e) => setForm({...form, unit: e.target.value})}
                                   className="col-span-3" disabled={isWeekly} placeholder="$, %, blank…"/>
                        </div>
                        {!isWeekly && hasPeriod && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right">Month</label>
                                <Input
                                    type="month"
                                    value={form.period}
                                    onChange={(e) => {
                                        setForm({...form, period: e.target.value});
                                        if (errors.period) setErrors(s => ({...s, period: undefined}));
                                    }}
                                    className={`col-span-3 ${errors.period ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                />
                                {errors.period &&
                                    <p className="col-span-3 col-start-2 text-xs text-red-600">{errors.period}</p>}
                            </div>
                        )}
                        {isWeekly && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right">Parent KPI</label>
                                <Select
                                    value={form.parentId}
                                    onValueChange={(v) => {
                                        setForm({...form, parentId: v});
                                        if (errors.parentId) setErrors(s => ({...s, parentId: undefined}));
                                        const p = monthly.find(m => String(m.id) === v);
                                        if (p) setForm(f => ({...f, unit: p.unit ?? ''}));
                                    }}
                                >
                                    <SelectTrigger
                                        className={`col-span-3 ${errors.parentId ? 'border-red-500 focus-visible:ring-red-500' : ''}`}>
                                        <SelectValue placeholder="Select"/>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {monthly.map(m => (<SelectItem key={String(m.id)}
                                                                       value={String(m.id)}>{m.title}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                                {errors.parentId &&
                                    <p className="col-span-3 col-start-2 text-xs text-red-600">{errors.parentId}</p>}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex items-center gap-2">
                        {editing && (
                            <>
                                <Button variant="secondary" onClick={duplicateEditing}>Duplicate</Button>
                                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                                    <AlertDialogTrigger asChild><Button variant="destructive"
                                                                        className="mr-auto">Delete</Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete this KPI?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                {`“${editing?.title}” will be permanently deleted${editing?.parentId ? ' (weekly)' : ' (monthly and its weekly children)'}. This action cannot be undone.`}
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </>
                        )}
                        <Button onClick={save}>{editing ? 'Save' : 'Add'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
