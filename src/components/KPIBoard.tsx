'use client'

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Plus, Edit } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

// ---------- Types ----------
interface KPI {
    id: number | string;
    title: string;
    current: number;
    target: number;
    unit?: string; // e.g. $, %, blank ⇒ absolute count
    parentId?: number | string | null; // null ⇒ monthly, otherwise points to monthly parent
}

// DB row types (no `any`)
interface MonthlyRow {
    id: number | string;
    title: string;
    unit: string | null;
    target: number | string;
    current: number | string;
}
interface WeeklyRow {
    id: number | string;
    parent_id: number | string;
    title: string;
    unit: string | null;
    target: number | string;
    current: number | string;
}

// Upsert payloads
interface MonthlyUpsert {
    id?: number | string;
    title: string;
    unit?: string;
    target: number;
    current: number;
}
interface WeeklyUpsert {
    id?: number | string;
    parent_id: number;
    title: string;
    unit?: string;
    target: number;
    current: number;
}

// ---------- Color helpers ----------
// Use parent class with a child selector to color the inner progress bar in shadcn/ui
const progressBarClass = (p: number) => {
    if (p >= 0.8) return "[&>div]:bg-green-500";
    if (p >= 0.6) return "[&>div]:bg-yellow-400";
    if (p >= 0.25) return "[&>div]:bg-orange-400";
    return "[&>div]:bg-red-500";
};

const textColor = (p: number) => {
    if (p >= 0.8) return "text-green-600";
    if (p >= 0.6) return "text-yellow-600";
    if (p >= 0.25) return "text-orange-600";
    return "text-red-600";
};

// ---------- Component ----------
export default function KPIBoard() {
    const supabase = useMemo(() => createSupabaseBrowser(), []);

    const [kpis, setKpis] = useState<KPI[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editing, setEditing] = useState<KPI | null>(null);
    const [isWeekly, setIsWeekly] = useState(false);
    const [form, setForm] = useState({
        title: "",
        current: "",
        target: "",
        unit: "",
        parentId: "",
    });

    // ---------- Data helpers (Supabase) ----------
    const fetchKpis = async () => {
        setLoading(true);
        const [{ data: monthly, error: mErr }, { data: weekly, error: wErr }] = await Promise.all([
            supabase.from("kpi_monthly").select("id,title,unit,target,current").order("id"),
            supabase.from("kpi_weekly").select("id,parent_id,title,unit,target,current").order("id"),
        ]);
        if (mErr || wErr) {
            console.error(mErr || wErr);
            setLoading(false);
            return;
        }

        const monthlyRows: MonthlyRow[] = (monthly ?? []) as unknown as MonthlyRow[];
        const weeklyRows: WeeklyRow[] = (weekly ?? []) as unknown as WeeklyRow[];

        const mappedMonthly: KPI[] = monthlyRows.map((m) => ({
            id: m.id,
            title: m.title,
            unit: m.unit ?? "",
            target: Number(m.target) ?? 0,
            current: Number(m.current) ?? 0,
            parentId: null,
        }));
        const mappedWeekly: KPI[] = weeklyRows.map((w) => ({
            id: w.id,
            title: w.title,
            unit: w.unit ?? "",
            target: Number(w.target) ?? 0,
            current: Number(w.current) ?? 0,
            parentId: w.parent_id,
        }));
        setKpis([...mappedMonthly, ...mappedWeekly]);
        setLoading(false);
    };

    const upsertMonthly = async (payload: MonthlyUpsert) => {
        const { data, error } = await supabase
            .from("kpi_monthly")
            .upsert(payload, { onConflict: "id" })
            .select()
            .maybeSingle();
        if (error) throw error;
        return data as MonthlyRow | null;
    };

    const upsertWeekly = async (payload: WeeklyUpsert) => {
        const { data, error } = await supabase
            .from("kpi_weekly")
            .upsert(payload, { onConflict: "id" })
            .select()
            .maybeSingle();
        if (error) throw error;
        return data as WeeklyRow | null;
    };

    // ---------- Lifecycle ----------
    useEffect(() => {
        fetchKpis();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------- Dialog helpers ----------
    const openNew = (weekly: boolean) => {
        setEditing(null);
        setIsWeekly(weekly);
        setForm({ title: "", current: "", target: "", unit: "", parentId: "" });
        setIsDialogOpen(true);
    };

    const openEdit = (kpi: KPI) => {
        setEditing(kpi);
        setIsWeekly(!!kpi.parentId);
        setForm({
            title: kpi.title,
            current: String(kpi.current),
            target: String(kpi.target),
            unit: kpi.unit ?? "",
            parentId: kpi.parentId ? String(kpi.parentId) : "",
        });
        setIsDialogOpen(true);
    };

    const monthly = kpis.filter((k) => k.parentId === null || k.parentId === undefined);
    const weekly = kpis.filter((k) => k.parentId !== null && k.parentId !== undefined);

    const save = async () => {
        const { title, current, target, unit, parentId } = form;
        if (!title || !current || !target || (isWeekly && !parentId)) return;

        try {
            if (isWeekly) {
                // Unit consistency check (UI-level; server also enforces via trigger)
                const parent = monthly.find((m) => String(m.id) === String(parentId));
                const parentUnit = parent?.unit ?? "";
                const childUnit = unit || "";
                if (parentUnit !== childUnit) {
                    alert(`Unit mismatch: weekly KPI must use the same unit ('${parentUnit || "—"}') as its monthly parent.`);
                    return;
                }
                const payload: WeeklyUpsert = {
                    id: editing ? editing.id : undefined,
                    parent_id: Number(parentId),
                    title,
                    unit: childUnit,
                    current: Number(current),
                    target: Number(target),
                };
                await upsertWeekly(payload);
                await fetchKpis();
                setIsDialogOpen(false);
            } else {
                const payload: MonthlyUpsert = {
                    id: editing ? editing.id : undefined,
                    title,
                    unit: unit || "",
                    current: Number(current),
                    target: Number(target),
                };
                await upsertMonthly(payload);
                await fetchKpis();
                setIsDialogOpen(false);
            }
        } catch (e: unknown) {
            console.error(e);
            alert("Saving failed. Check console for details.");
        }
    };

    // ---------- Render ----------
    return (
        <div className="min-h-screen bg-gradient-to-tr from-slate-50 to-slate-100 p-6">
            {/* Header */}
            <header className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold">📊 KPI Board</h1>
                <div className="flex gap-2">
                    <Button onClick={() => openNew(false)} className="gap-2">
                        <Plus size={18} />Monthly KPI
                    </Button>
                    <Button variant="secondary" onClick={() => openNew(true)} className="gap-2">
                        <Plus size={18} />Weekly KPI
                    </Button>
                </div>
            </header>

            {/* Monthly section */}
            <h2 className="text-xl font-semibold mb-3">Monthly KPIs</h2>
            {loading ? (
                <div className="text-slate-500">Loading…</div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {monthly.map((kpi) => {
                        const children = weekly.filter((w) => String(w.parentId) === String(kpi.id));
                        const derivedCurrent = children.length
                            ? children.reduce((sum, c) => sum + c.current, 0)
                            : kpi.current;
                        const progress = derivedCurrent / (kpi.target || 1);

                        return (
                            <Card key={String(kpi.id)} className="shadow-md">
                                <CardContent className="p-4 space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div className="font-semibold leading-snug">{kpi.title}</div>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(kpi)}>
                                            <Edit size={16} />
                                        </Button>
                                    </div>
                                    <div className={`text-2xl font-bold tracking-tight ${textColor(progress)}`}>
                                        {kpi.unit}
                                        {derivedCurrent.toLocaleString()} <span className="text-base font-medium text-slate-500">/ {kpi.unit}{kpi.target.toLocaleString()}</span>
                                    </div>
                                    <Progress value={Math.min(progress * 100, 100)} className={`h-2 ${progressBarClass(progress)}`} />

                                    {/* Weekly children */}
                                    {children.length > 0 && (
                                        <div className="space-y-3 pt-2">
                                            {children.map((wk) => {
                                                const wp = wk.current / (wk.target || 1);
                                                return (
                                                    <div key={String(wk.id)} className="pl-2 border-l border-slate-200">
                                                        <div className="flex items-start justify-between">
                                                            <span className="text-sm font-medium">{wk.title}</span>
                                                            <Button variant="ghost" size="icon" onClick={() => openEdit(wk)}>
                                                                <Edit size={14} />
                                                            </Button>
                                                        </div>
                                                        <div className={`text-sm font-semibold ${textColor(wp)}`}>{wk.unit}{wk.current} / {wk.unit}{wk.target}</div>
                                                        <Progress value={Math.min(wp * 100, 100)} className={`h-1.5 ${progressBarClass(wp)}`} />
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
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? "Edit KPI" : isWeekly ? "Add Weekly KPI" : "Add Monthly KPI"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {/* Title */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Title</label>
                            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="col-span-3" />
                        </div>
                        {/* Current */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Current</label>
                            <Input type="number" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} className="col-span-3" />
                        </div>
                        {/* Target */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Target</label>
                            <Input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className="col-span-3" />
                        </div>
                        {/* Unit */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Unit</label>
                            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="col-span-3" disabled={isWeekly} placeholder="$, %, blank…" />
                        </div>
                        {/* Parent selector for weekly */}
                        {isWeekly && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right">Parent KPI</label>
                                <Select
                                    value={form.parentId}
                                    onValueChange={(v) => {
                                        setForm({ ...form, parentId: v });
                                        // auto‑fill unit from parent
                                        const p = monthly.find((m) => String(m.id) === v);
                                        if (p) setForm((f) => ({ ...f, unit: p.unit ?? "" }));
                                    }}
                                >
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {monthly.map((m) => (
                                            <SelectItem key={String(m.id)} value={String(m.id)}>
                                                {m.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}