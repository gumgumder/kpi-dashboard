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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

// Module cache for Notion stats (persists until refresh)
let NOTION_STATS_CACHE: unknown | null = null;

// ---------- Types ----------
interface KPI {
    id: number | string;
    title: string;
    current: number;
    target: number;
    unit?: string; // e.g. $, %, blank ⇒ absolute count
    parentId?: number | string | null; // null ⇒ monthly, otherwise points to monthly parent
    period?: string; // YYYY-MM for monthly KPIs
}

// DB row types (no `any`)
interface MonthlyRow {
    id: number | string;
    title: string;
    unit: string | null;
    target: number | string;
    current: number | string;
    period?: string | null; // may not exist if column missing
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
    period?: string; // optional; sent only if column exists
}

type MonthlyInsert = Omit<MonthlyUpsert, "id">;
interface WeeklyUpsert {
    id?: number | string;
    parent_id: number;
    title: string;
    unit?: string;
    target: number;
    current: number;
}

type WeeklyInsert = Omit<WeeklyUpsert, "id">;

// ---------- Color helpers ----------
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

const formatPeriodLabel = (period?: string) => {
    if (!period) return "";
    const [y, m] = period.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleString('en-GB', { month: "long", year: "numeric" });
};

// ---------- Dev self-tests (run only in dev) ----------
function runDevSelfTests() {
    try {
        const cases = [
            { p: 0, expect: "red" },
            { p: 0.249, expect: "red" },
            { p: 0.25, expect: "orange" },
            { p: 0.6, expect: "yellow" },
            { p: 0.8, expect: "green" },
            { p: 1, expect: "green" },
        ];
        const mapClass = (p: number) => progressBarClass(p).match(/bg-(\w+)-/i)?.[1];
        cases.forEach(({ p, expect }) => {
            const cls = mapClass(p);
            if (!cls) console.warn("Test(progressBarClass) no class for", p);
            else if (
                (expect === "red" && cls !== "red") ||
                (expect === "orange" && cls !== "orange") ||
                (expect === "yellow" && cls !== "yellow") ||
                (expect === "green" && cls !== "green")
            ) {
                console.error("progressBarClass FAILED", { p, cls, expect });
            }
        });

        const period = "2025-08";
        const label = formatPeriodLabel(period);
        if (!label || !label.includes("2025")) {
            console.error("formatPeriodLabel FAILED", { period, label });
        }
    } catch (e) {
        console.error("Self-tests errored", e);
    }
}

// ---------- Component ----------
export default function KPIBoard() {
    const supabase = useMemo(() => createSupabaseBrowser(), []);

    const [kpis, setKpis] = useState<KPI[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [editing, setEditing] = useState<KPI | null>(null);
    const [isWeekly, setIsWeekly] = useState(false);
    const [hasPeriod, setHasPeriod] = useState(true); // detect if DB column exists
    const [form, setForm] = useState({
        title: "",
        current: "",
        target: "",
        unit: "",
        parentId: "",
        period: "",
    });

    // Run dev self-tests once
    useEffect(() => {
        if (process.env.NODE_ENV !== "production") runDevSelfTests();
    }, []);

    // ---------- Data helpers (Supabase) ----------
    const fetchKpis = async () => {
        setLoading(true);

        // Try selecting with period; fallback if column missing
        let monthlyRows: MonthlyRow[] = [];
        let weeklyRows: WeeklyRow[] = [];

        const { data: monthlyWithPeriod, error: mErr } = await supabase
            .from("kpi_monthly")
            .select("id,title,unit,target,current,period")
            .order("id");

        const mCode = (mErr as { code?: string; message?: string } | null)?.code;
        if (mErr && mCode === "42703") {
            // column does not exist
            const { data: monthlyNoPeriod, error: mErr2 } = await supabase
                .from("kpi_monthly")
                .select("id,title,unit,target,current")
                .order("id");
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

        const { data: weekly, error: wErr } = await supabase
            .from("kpi_weekly")
            .select("id,parent_id,title,unit,target,current")
            .order("id");
        if (wErr) {
            console.error(wErr);
            setLoading(false);
            return;
        }
        const weeklyRowsRes = (weekly ?? []) as unknown as WeeklyRow[];
        weeklyRows = weeklyRowsRes;

        const mappedMonthly: KPI[] = monthlyRows.map((m) => ({
            id: m.id,
            title: m.title,
            unit: m.unit ?? "",
            target: Number(m.target) ?? 0,
            current: Number(m.current) ?? 0,
            parentId: null,
            period: m.period ?? undefined,
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

    const insertMonthly = async (payload: MonthlyInsert) => {
        const { data, error } = await supabase
            .from("kpi_monthly")
            .insert(payload)
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

    const insertWeekly = async (payload: WeeklyInsert) => {
        const { data, error } = await supabase
            .from("kpi_weekly")
            .insert(payload)
            .select()
            .maybeSingle();
        if (error) throw error;
        return data as WeeklyRow | null;
    };

    const deleteMonthly = async (id: number | string) => {
        const { error } = await supabase.from("kpi_monthly").delete().eq("id", Number(id));
        if (error) throw error;
    };

    const deleteWeekly = async (id: number | string) => {
        const { error } = await supabase.from("kpi_weekly").delete().eq("id", Number(id));
        if (error) throw error;
    };

    // ---------- Lifecycle ----------
    useEffect(() => {
        fetchKpis();  }, []);

    // ---------- Dialog helpers ----------
    const openNew = (weekly: boolean) => {
        setEditing(null);
        setIsWeekly(weekly);
        setForm({ title: "", current: "", target: "", unit: "", parentId: "", period: "" });
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
            period: kpi.period ?? "",
        });
        setIsDialogOpen(true);
    };

    const monthly = kpis.filter((k) => k.parentId === null || k.parentId === undefined);
    const weekly = kpis.filter((k) => k.parentId !== null && k.parentId !== undefined);

    const save = async () => {
        const { title, current, target, unit, parentId, period } = form;
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
                if (hasPeriod) payload.period = period || "";
                await upsertMonthly(payload);
                await fetchKpis();
                setIsDialogOpen(false);
            }
        } catch (e: unknown) {
            console.error(e);
            alert("Saving failed. Check console for details.");
        }
    };

    const confirmDelete = async () => {
        if (!editing) return;
        try {
            if (editing.parentId !== null && editing.parentId !== undefined) {
                await deleteWeekly(editing.id);
            } else {
                await deleteMonthly(editing.id);
            }
            setConfirmOpen(false);
            setIsDialogOpen(false);
            await fetchKpis();
        } catch (e) {
            console.error(e);
            alert("Delete failed. Check console for details.");
        }
    };

    // ---------- Duplicate ----------
    const incrementWeekly = async (id: number | string, currentVal: number) => {
        try {
            const { error } = await supabase
                .from('kpi_weekly')
                .update({ current: currentVal + 1 })
                .eq('id', Number(id));
            if (error) throw error;
            await fetchKpis();
        } catch (e) {
            console.error(e);
            alert('Increment failed.');
        }
    };
    const duplicateEditing = async () => {
        if (!editing) return;
        try {
            if (editing.parentId !== null && editing.parentId !== undefined) {
                // Duplicate a WEEKLY under the same parent
                const payload: WeeklyInsert = {
                    parent_id: Number(editing.parentId),
                    title: `Copy of ${editing.title}`,
                    unit: editing.unit || "",
                    target: Number(editing.target),
                    current: Number(editing.current),
                };
                await insertWeekly(payload);
            } else {
                // Duplicate a MONTHLY and all its WEEKLY children
                const mPayload: MonthlyInsert = {
                    title: `Copy of ${editing.title}`,
                    unit: editing.unit || "",
                    target: Number(editing.target),
                    current: Number(editing.current),
                };
                if (hasPeriod && editing.period) mPayload.period = editing.period;
                const newMonthly = await insertMonthly(mPayload);
                if (!newMonthly) throw new Error("Monthly duplicate failed");

                // Fetch original children
                const { data: children, error: cErr } = await supabase
                    .from("kpi_weekly")
                    .select("id,parent_id,title,unit,target,current")
                    .eq("parent_id", Number(editing.id));
                if (cErr) throw cErr;

                const inserts: WeeklyInsert[] = ((children as WeeklyRow[]) || []).map((wk) => ({
                    parent_id: Number(newMonthly.id),
                    title: `Copy of ${wk.title}`,
                    unit: wk.unit ?? "",
                    target: Number(wk.target) ?? 0,
                    current: Number(wk.current) ?? 0,
                }));

                if (inserts.length) {
                    const { error: bulkErr } = await supabase.from("kpi_weekly").insert(inserts);
                    if (bulkErr) throw bulkErr;
                }
            }
            await fetchKpis();
            setIsDialogOpen(false);
        } catch (e) {
            console.error(e);
            alert("Duplicate failed. Check console.");
        }
    };

    // ---------- Short Videos (Notion) ----------
    type VideoStats = {
        total: number;
        byStatus: Record<string, number>;
        itemsByStatus: Record<string, string[]>;
        byOwner?: Array<{ name: string; count: number }>;
        lastUpdated?: string;
    };

    const ALLOWED_STATUSES = [
        "Internal Review",
        "Ready for Filming",
        "Filmed",
        "Editing-Jakob",
        "Editing",
        "Scheduled",
    ] as const;
    type Status = typeof ALLOWED_STATUSES[number];
    const STATUS_STYLES: Record<Status, string> = {
        "Internal Review": "bg-blue-50 border-blue-200",
        "Ready for Filming": "bg-yellow-50 border-yellow-200",
        "Filmed": "bg-green-50 border-green-200",
        "Editing-Jakob": "bg-amber-50 border-amber-200",
        "Editing": "bg-red-50 border-red-200",
        "Scheduled": "bg-blue-50 border-blue-200",
    };

    function ShortVideosSection() {
        const [stats, setStats] = useState<VideoStats | null>(null);
        const [loading, setLoading] = useState<boolean>(false);
        const [error, setError] = useState<string | null>(null);
        const [goalDate, setGoalDate] = useState<string>(() => {
            const TZ = 'Europe/Vienna';
            const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const today = new Date(`${todayStr}T00:00:00Z`); // Vienna midnight today in UTC
            const y = today.getUTCFullYear();
            const m = today.getUTCMonth(); // 0-based
            const endOfMonthUTC = new Date(Date.UTC(y, m + 1, 0));
            return endOfMonthUTC.toISOString().slice(0, 10); // YYYY-MM-DD
        });

        const TZ = 'Europe/Vienna';
        const daysUntil = (iso: string): number => {
            if (!iso) return 0;
            // Compute using Vienna's calendar day boundaries
            const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const start = new Date(`${todayStr}T00:00:00Z`); // Vienna midnight today in UTC
            const end = new Date(`${iso}T00:00:00Z`);       // Vienna midnight of goal date in UTC
            const diffDays = (end.getTime() - start.getTime()) / 86_400_000;
            return Math.max(0, Math.round(diffDays));
        };

        const formatGoal = (iso: string) => {
            if (!iso) return '—';
            const d = new Date(`${iso}T00:00:00Z`);
            return d.toLocaleDateString('en-GB', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric' });
        };

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch('/api');
                if (!res.ok) throw new Error(await res.text());
                const json: VideoStats = await res.json();
                // Ensure every status key has an array of IDs
                const filled: Record<string, string[]> = { ...json.itemsByStatus };
                for (const k of Object.keys(json.byStatus || {})) {
                    if (!filled[k]) filled[k] = [];
                }
                const sum = Object.values(json.byStatus || {}).reduce((a, b) => a + b, 0);
                if (json.total !== sum) console.warn('Notion stats mismatch: total vs sum(byStatus)', { total: json.total, sum });
                NOTION_STATS_CACHE = { ...json, itemsByStatus: filled } as VideoStats;
                setStats(NOTION_STATS_CACHE as VideoStats);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to load stats');
            } finally {
                setLoading(false);
            }
        };

        useEffect(() => {
            if (NOTION_STATS_CACHE) {
                setStats(NOTION_STATS_CACHE as VideoStats);
            } else {
                load();
            }
        }, []);

        // Preload saved goal date from server on mount
        useEffect(() => {
            (async () => {
                try {
                    const res = await fetch('/api/app-settings/goal-date');
                    if (res.ok) {
                        const { value } = await res.json();
                        if (value) setGoalDate(value);
                    }
                } catch (err) {
                    console.warn('Could not preload goal date', err);
                }
            })();
        }, []);

        const totalShown = stats ? ALLOWED_STATUSES.reduce((acc, s) => acc + (stats.byStatus?.[s] ?? 0), 0) : 0;
        const totalExclScheduled = stats ? ALLOWED_STATUSES.filter((s) => s !== 'Scheduled').reduce((acc, s) => acc + (stats.byStatus?.[s] ?? 0), 0) : 0;

        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Short Videos</h2>
                    <div className="flex gap-2 items-center">
                        <Input type="date" value={goalDate} onChange={async (e) => { const v = e.target.value; setGoalDate(v); try { await fetch('/api/app-settings/goal-date', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: v }) }); } catch (err) { console.error('Saving goal date failed', err); } }} className="h-9 w-auto" />
                        <Button variant="secondary" onClick={load} disabled={loading}>
                            {loading ? 'Refreshing…' : 'Refresh'}
                        </Button>
                    </div>
                </div>

                {error && (
                    <Card>
                        <CardContent className="p-4 text-sm text-red-600">
                            {error}
                            <div className="text-slate-600 mt-2">
                                Ensure you create <code>src/app/api/route.ts</code>
                                with your Notion secret on the server, and set env var <code>NOTION_VIDEOS_DB_ID</code>.
                            </div>
                        </CardContent>
                    </Card>
                )}

                {!error && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Card>
                                <CardContent className="p-4">
                                    <div className="text-slate-500 text-sm">Goal Date</div>
                                    <div className="text-lg font-semibold mb-1">{formatGoal(goalDate)}</div>
                                    <div className="text-sm text-slate-600">Needed videos (days left): <span className="font-bold">{daysUntil(goalDate)}</span></div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4">
                                    <div className="text-slate-500 text-sm">Totals</div>
                                    <div className="text-sm">Sum pipeline: <span className="font-semibold">{stats ? totalShown : (loading ? '…' : 0)}</span></div>
                                    <div className="text-sm">To be finished: <span className="font-semibold">{stats ? totalExclScheduled : (loading ? '…' : 0)}</span></div>
                                    <div className="text-sm">To be scripted: <span className="font-semibold">{Math.max(0, daysUntil(goalDate) - (stats ? totalShown : 0))}</span></div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Columns per status: count on top, list of item IDs below */}
                        {stats && (
                            <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
                                {ALLOWED_STATUSES.map((status) => (
                                    <Card key={status} className={`${STATUS_STYLES[status]} shadow-sm`}>
                                        <CardContent className="p-3">
                                            <div className="flex items-baseline justify-between mb-2">
                                                <div className="text-xs font-medium text-slate-600">{status}</div>
                                                <div className="text-xl font-bold">{stats.byStatus?.[status] ?? 0}</div>
                                            </div>
                                            <div className="max-h-48 overflow-auto pr-1">
                                                {(stats.itemsByStatus?.[status] || []).length ? (
                                                    <ul className="space-y-1">
                                                        {stats.itemsByStatus[status].map((id) => (
                                                            <li key={id} className="text-xs rounded bg-slate-50 border border-slate-200 px-2 py-1 truncate">{id}</li>
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
                        )}
                    </>
                )}
            </div>
        );
    }

    // ---------- Render ----------
    return (
        <div className="min-h-screen bg-gradient-to-tr from-slate-50 to-slate-100 p-6">
            <Tabs defaultValue="kpis" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="kpis">KPIs</TabsTrigger>
                    <TabsTrigger value="videos">Short Videos</TabsTrigger>
                </TabsList>

                <TabsContent value="kpis" className="data-[state=inactive]:hidden">
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
                                        <CardContent className="px-4 pb-4 pt-2 space-y-4">
                                            <div className="flex items-start justify-between">
                                                <div className="font-semibold leading-snug">
                                                    {kpi.period && (
                                                        <div className="mt-0 mb-2">
                          <span className="inline-block rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-0.5 border border-indigo-100">
                            {formatPeriodLabel(kpi.period)}
                          </span>
                                                        </div>
                                                    )}
                                                    <div>{kpi.title}</div>
                                                </div>
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
                                                                    <div className="flex items-center gap-1">
                                                                        <Button variant="outline" className="h-6 w-6 px-0 text-xs" onClick={() => incrementWeekly(wk.id, wk.current)}>+1</Button>
                                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(wk)}>
                                                                            <Edit size={14} />
                                                                        </Button>
                                                                    </div>
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
                                {/* Month (monthly only) */}
                                {!isWeekly && hasPeriod && (
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <label className="text-right">Month</label>
                                        <Input type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="col-span-3" />
                                    </div>
                                )}
                                {!isWeekly && !hasPeriod && (
                                    <div className="col-span-4 text-xs text-slate-500 px-1">
                                        To enable month tagging, add a <code>period</code> column to <code>kpi_monthly</code> (SQL provided in docs) and redeploy.
                                    </div>
                                )}
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
                            <DialogFooter className="flex items-center gap-2">
                                {editing && (
                                    <>
                                        <Button variant="secondary" onClick={duplicateEditing}>Duplicate</Button>
                                        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" className="mr-auto">Delete</Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete this KPI?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        {`“${editing?.title}” will be permanently deleted${editing?.parentId ? " (weekly)" : " (monthly and its weekly children)"}. This action cannot be undone.`}
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
                                <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                <TabsContent value="videos" className="data-[state=inactive]:hidden">
                    {/** Notion-powered dashboard */}
                    <ShortVideosSection />
                </TabsContent>
            </Tabs>
        </div>
    );
}
