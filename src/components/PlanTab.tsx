// typescript
'use client';

import React, { useEffect, useState } from 'react';

type Summary = Record<string, number>;

export default function PlanTab() {
    const goals = { linkedin_dm_goal: 1800, upwork_goal: 250 };

    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                setLoading(true);
                setErr(null);
                const body = {
                    start: '2025-10-20',
                    end:   '2025-12-31',
                    fields: ['Outreach:LI_Erstnachricht', 'Outreach:UW_Proposals'],
                    tab: 'Merged',
                };
                const startYear = new Date(body.start).getFullYear();

                const res = await fetch(`/api/outreach/summary?year=${startYear}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify(body),
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                setSummary(data.summary ?? {});
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err ?? 'Failed to load');
                setErr(msg);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, []);

    const li = Number(summary?.['Outreach:LI_Erstnachricht'] ?? 0);
    const uw = Number(summary?.['Outreach:UW_Proposals'] ?? 0);

    const progress = {
        linkedin_dm: Math.min(100, Math.round((li / goals.linkedin_dm_goal) * 100)),
        upwork:      Math.min(100, Math.round((uw / goals.upwork_goal) * 100)),
    };

    const ProgressRow = ({ label, value, total, goal }: { label: string; value: number; total?: number; goal?: number }) => (
        <div className="mb-6">
            <div className="flex justify-between items-baseline mb-2">
                <span className="text-lg font-semibold text-slate-800">{label}</span>
                <span className="text-lg text-slate-700">
                    {value}%{total != null && (
                    <span className="ml-3 text-sm text-slate-500">
                            ({Math.round(total)}{goal != null ? ` / ${goal}` : ''})
                        </span>
                )}
                </span>
            </div>
            <div className="w-full h-6 bg-slate-200 rounded overflow-hidden" role="progressbar"
                 aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-amber-400 rounded transition-all duration-500" style={{ width: `${value}%` }} />
            </div>
        </div>
    );

    return (
        <div className="p-8 text-xl text-slate-700 flex justify-center">
            <div className="grid grid-cols-3 w-full max-w-6xl">
                {/* Left sections */}
                <main className="col-span-1 md:col-span-2 space-y-8">
                    <section className="text-left">
                        <h2 className="text-2xl font-bold mb-3">Commitments — Jakob</h2>
                        <ul className="list-disc list-inside space-y-2 text-base">
                            <li>J: Ro100 – 5x pro Woche (200 Nachrichten, 10 Kommentare/Tag, Rest Calls)</li>
                        </ul>
                    </section>

                    <section className="text-left">
                        <h2 className="text-2xl font-bold mb-3">Commitments — Annika</h2>
                        <ul className="list-disc list-inside space-y-2 text-base">
                            <li>A: 7x Posts pro Woche</li>
                            <li>A: 200 Seiten pro Woche lesen</li>
                            <li>A: Glaubenssätze wiederholen</li>
                        </ul>
                    </section>

                    <section className="w-full max-w-none text-left">
                        <h2 className="text-2xl font-bold mb-3">General Commitments</h2>
                        <ul className="list-disc list-inside space-y-2 text-base">
                            <li>Complain dashboard / Emotional state dashboard</li>
                            <li>Daily danceparty (1 song)</li>
                            <li>Daily “I am the voice”</li>
                            <li>Codeword: STATE – watch your state</li>
                            <li>2 date schedule (am 1. des Monats)</li>
                            <li>1 day Mind Movie</li>
                            <li>1 day Rebranding</li>
                            <li>1 day Offer</li>
                            <li>Peer group (End of month)</li>
                            <li>Frustration = Innovation = 3 ideas</li>
                            <li>Questions: What extraordinary at?</li>
                            <li>Questions: Where do we wanna go?</li>
                        </ul>
                    </section>
                </main>

                {/* Right: Progress panel */}
                <aside className="col-span-2 md:col-span-1">
                    <div className="sticky top-6 p-6 bg-white border border-slate-200 rounded-lg shadow-sm">
                        <h3 className="text-2xl font-semibold mb-4 text-center">Progress</h3>

                        {err && <p className="text-base text-red-600 text-center">{err}</p>}
                        {loading && !err && <p className="text-base text-slate-500 text-center">Loading…</p>}

                        {!loading && !err && (
                            <>
                                <ProgressRow
                                    label="LinkedIn DMs sent"
                                    value={progress.linkedin_dm}
                                    total={li}
                                    goal={goals.linkedin_dm_goal}
                                />
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <ProgressRow
                                        label="UpWork Proposals sent"
                                        value={progress.upwork}
                                        total={uw}
                                        goal={goals.upwork_goal}
                                    />
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-100">
                                    <h4 className="text-lg font-medium mb-3 text-center">Totals (20.10.2025 — 31.12.2025)</h4>
                                    <div className="flex justify-between text-base py-2">
                                        <span className="text-slate-800">LI_Erstnachricht</span>
                                        <span className="text-slate-600">{li}</span>
                                    </div>
                                    <div className="flex justify-between text-base py-2">
                                        <span className="text-slate-800">UW_Proposals</span>
                                        <span className="text-slate-600">{uw}</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
