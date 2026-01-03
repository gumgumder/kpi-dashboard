// typescript
'use client';

import React, { useEffect, useState } from 'react';

type Summary = Record<string, number>;

export default function PlanTab() {
    const goals = { primary_action_goal: 24000, pieces_of_content_goal: 500 };

    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                setLoading(true);
                setErr(null);
                const body_outreach = {
                    start: '2026-01-01',
                    end:   '2026-12-31',
                    fields: ['Outreach:LI_Erstnachricht', 'Outreach:LI_FollowUp'],
                    tab: 'Merged',
                };
                const body_content = {
                    start: '2026-01-01',
                    end:   '2026-12-31',
                    fields: ['Content:Comments', 'Content:Posts'],
                    tab: 'Merged',
                };
                const startYear = new Date(body_outreach.start).getFullYear();

                const res = await fetch(`/api/outreach/summary?year=${startYear}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify(body_outreach),
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
        primary_action: Math.min(100, Math.round((li / goals.primary_action_goal) * 100)),
        pieces_of_content:      Math.min(100, Math.round((uw / goals.pieces_of_content_goal) * 100)),
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
                        <h2 className="text-2xl font-bold mb-3">Business Goals</h2>
                        <ul className="list-disc list-inside space-y-2 text-base">
                            <li>500k Revenue</li>
                            <li>One Core offer (wie bei den Websites) mit sinnvollem Pricing (Core Offer: 5-stellig; Entry Offer: Mittel 4-stellig)</li>
                                <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-sm">
                                    <li>1st half year → Portfolio + Testimonials aufbauen</li>
                                    <li>2nd half year → Downnichen & Core Offers etablieren</li>
                                </ul>
                            <li>1 funktionierender Akquiseweg (aka wenn wir x tun passiert y)</li>
                            <li>Jeden Tag 1 Piece of Content gepostet</li>
                                <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-sm">
                                    <li>Total 500 Pieces of Content incl. 25 YT Videos</li>
                                </ul>
                            <li>24.000 Primary Actions (Message, Calls, Upwork Proposals, Comments (fremder Post), Cold Email, Brief,..)</li>
                                <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-sm">
                                    <li>Davon 12.000 unique new Outreaches</li>
                                </ul>
                            <li>Invest in 1:1 Coaching</li>
                                <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-sm">
                                    <li>1. Session pP bis Mitte Februar</li>
                                </ul>
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
                                    label="Primary actions"
                                    value={progress.primary_action}
                                    total={li}
                                    goal={goals.primary_action_goal}
                                />
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <ProgressRow
                                        label="Pieces of content"
                                        value={progress.pieces_of_content}
                                        total={uw}
                                        goal={goals.pieces_of_content_goal}
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
