'use client'

import { useState, useEffect } from "react";
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

// ---------- Types ----------
interface KPI {
    id: number;
    title: string;
    current: number;
    target: number;
    unit?: string; // e.g. $, %, blank ⇒ absolute count
    parentId?: number | null; // null ⇒ monthly, otherwise points to monthly parent
}

// ---------- Helpers ----------
const loadKpis = (): KPI[] => {
    try {
        const stored = localStorage.getItem("kpis");
        return stored ? JSON.parse(stored) : [];
    } catch (_) {
        return [];
    }
};

const saveKpis = (kpis: KPI[]) => localStorage.setItem("kpis", JSON.stringify(kpis));

const progressColor = (p: number) => {
    if (p >= 0.8) return "bg-green-500";
    if (p >= 0.6) return "bg-yellow-400";
    if (p >= 0.25) return "bg-orange-400";
    return "bg-red-500";
};

const textColor = (p: number) => {
    if (p >= 0.8) return "text-green-600";
    if (p >= 0.6) return "text-yellow-600";
    if (p >= 0.25) return "text-orange-600";
    return "text-red-600";
};

// ---------- Component ----------
export default function KPIBoard() {
    const [kpis, setKpis] = useState<KPI[]>([]);
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

    // ---------- Lifecycle ----------
    useEffect(() => {
        const initial = loadKpis();
        if (!initial.length) {
            setKpis([
                {
                    id: 1,
                    title: "Monthly Recurring Revenue",
                    current: 75000,
                    target: 100000,
                    unit: "$",
                    parentId: null,
                },
                {
                    id: 2,
                    title: "Active Users",
                    current: 4200,
                    target: 5000,
                    unit: "",
                    parentId: null,
                },
                {
                    id: 3,
                    title: "Net Promoter Score",
                    current: 48,
                    target: 60,
                    unit: "",
                    parentId: null,
                },
                {
                    id: 4,
                    title: "Weekly Sales Calls",
                    current: 45,
                    target: 60,
                    unit: "$",
                    parentId: 1,
                },
            ]);
        } else {
            setKpis(initial);
        }
    }, []);

    useEffect(() => saveKpis(kpis), [kpis]);

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

    const save = () => {
        const { title, current, target, unit, parentId } = form;
        if (!title || !current || !target || (isWeekly && !parentId)) return;

        // ----- Unit consistency for weekly KPIs -----
        if (isWeekly) {
            const parent = kpis.find((k) => k.id === Number(parentId));
            const parentUnit = parent?.unit ?? "";
            const childUnit = unit || "";
            if (parentUnit !== childUnit) {
                alert(
                    `Unit mismatch: weekly KPI must use the same unit ('${parentUnit || "—"}') as its monthly parent.`
                );
                return;
            }
        }

        const parsed: KPI = {
            id: editing ? editing.id : Date.now(),
            title,
            current: Number(current),
            target: Number(target),
            unit: unit || undefined,
            parentId: isWeekly ? Number(parentId) : null,
        };

        const updated = editing ? kpis.map((k) => (k.id === editing.id ? parsed : k)) : [...kpis, parsed];
        setKpis(updated);
        setIsDialogOpen(false);
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
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {monthly.map((kpi) => {
                    const children = weekly.filter((w) => w.parentId === kpi.id);
                    const derivedCurrent = children.length
                        ? children.reduce((sum, c) => sum + c.current, 0)
                        : kpi.current;
                    const progress = derivedCurrent / kpi.target;

                    return (
                        <Card key={kpi.id} className="shadow-md">
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="font-semibold leading-snug">{kpi.title}</div>
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(kpi)}>
                                        <Edit size={16} />
                                    </Button>
                                </div>
                                <div
                                    className={`text-2xl font-bold tracking-tight ${textColor(progress)}`}
                                >
                                    {kpi.unit}
                                    {derivedCurrent.toLocaleString()} <span className="text-base font-medium text-slate-500">/ {kpi.unit}{kpi.target.toLocaleString()}</span>
                                </div>
                                <Progress
                                    value={Math.min(progress * 100, 100)}
                                    className="h-2"
                                    colorClass={progressColor(progress)}
                                />
                                {/* Weekly children */}
                                {children.length > 0 && (
                                    <div className="space-y-3 pt-2">
                                        {children.map((wk) => {
                                            const wp = wk.current / wk.target;
                                            return (
                                                <div key={wk.id} className="pl-2 border-l border-slate-200">
                                                    <div className="flex items-start justify-between">
                                                        <span className="text-sm font-medium">{wk.title}</span>
                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(wk)}>
                                                            <Edit size={14} />
                                                        </Button>
                                                    </div>
                                                    <div className={`text-sm font-semibold ${textColor(wp)}`}>{wk.unit}{wk.current} / {wk.unit}{wk.target}</div>
                                                    <Progress
                                                        value={Math.min(progress * 100, 100)}
                                                        className="h-1.5"
                                                        colorClass={progressColor(progress)}
                                                    />
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
                            <Input
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        {/* Current */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Current</label>
                            <Input
                                type="number"
                                value={form.current}
                                onChange={(e) => setForm({ ...form, current: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        {/* Target */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Target</label>
                            <Input
                                type="number"
                                value={form.target}
                                onChange={(e) => setForm({ ...form, target: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        {/* Unit */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">Unit</label>
                            <Input
                                value={form.unit}
                                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                                className="col-span-3"
                                disabled={isWeekly}
                                placeholder="$, %, blank…"
                            />
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
                                            <SelectItem key={m.id} value={String(m.id)}>
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
