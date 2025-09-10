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

        const {data: monthlyWithPeriod, error: mErr} = await supabase
            .from('kpi_monthly').select('id,title,unit,target,current,period').order('id');

        if (mErr && (mErr as { code?: string }).code === '42703') {
            const {data: monthlyNoPeriod, error: mErr2} = await supabase
                .from('kpi_monthly').select('id,title,unit,target,current').order('id');
            if (mErr2) {
                console.error(mErr2);
                setLoading(false);
                return;
            }
            monthlyRows = (monthlyNoPeriod ?? []) as unknown as MonthlyRow[];
            setHasPeriod(false);
        } else if (mErr) {
            console.error(mErr);
            setLoading(false);
            return;
        } else {
            monthlyRows = (monthlyWithPeriod ?? []) as unknown as MonthlyRow[];
            setHasPeriod(true);
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

        // collect periods (only if column exists)
        if (hasPeriod) {
            const uniq = Array.from(
                new Set((monthlyRows ?? []).map(r => r.period).filter(Boolean) as string[])
            ).sort(); // lexicographic works for YYYY-MM
            setAvailablePeriods(uniq);

            // keep previous selection if still valid, else choose latest, else fallback to current month
            setSelectedPeriod(prev => {
                if (prev && uniq.includes(prev)) return prev;
                if (uniq.length) return uniq[uniq.length - 1];
                return currentYM();
            });
        }

        setKpis([...mappedMonthly, ...mappedWeekly]);
        setLoading(false);
    };

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

    // ---- Lifecycle ----
    useEffect(() => {
        fetchKpis();
    }, []);

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

    const allMonthly = kpis.filter(k => k.parentId === null || k.parentId === undefined);
    const monthly = hasPeriod
        ? allMonthly.filter(m => m.period === selectedPeriod)
        : allMonthly;
    const weekly = kpis.filter(k => k.parentId !== null && k.parentId !== undefined);

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
                    title: `${editing.title}`, unit: editing.unit || '',
                    target: Number(editing.target), current: Number(editing.current),
                });
            } else {
                const newMonthly = await insertMonthly({
                    title: `${editing.title}`, unit: editing.unit || '',
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
                    title: `${wk.title}`, unit: wk.unit ?? '',
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
