'use client';

import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';

type ValuesResponse = { range: string; values: string[][] };
type ChartPoint = { name: string; Umsatz: number };

// integer-safe parser: "2,880" -> 2880
function toInt(raw: unknown): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  const n = Number.parseInt(s.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

const fmtEUR = (n: number) =>
    new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

// match Recharts formatter signature (avoid any)
type TooltipFormatter = (value: number | string, name: string, item: unknown, index: number) => string;
const tooltipFormatter: TooltipFormatter = (value) =>
    fmtEUR(typeof value === 'number' ? value : toInt(value));

export default function RevenueTab() {
  const [values, setValues] = useState<string[][]>([]);
  const [range, setRange] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/google-sheets');
      if (!res.ok) throw new Error(await res.text());
      const json: ValuesResponse = await res.json();
      setValues(json.values ?? []);
      setRange(json.range ?? '');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Failed to load Revenue data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const { headers, rows, chartData, totalRevenue, totalMRRSigned } = useMemo(() => {
    if (!values.length) {
      return {
        headers: [] as string[],
        rows: [] as string[][],
        chartData: [] as ChartPoint[],
        totalRevenue: 0,
        totalMRRSigned: 0,
      };
    }
    const [hdr, ...rest] = values; // ["2025","Umsatz","Retainer p.M"]

    const parsed = rest.map((r) => ({
      month: r[0] ?? '',
      revenue: toInt(r[1]),
      retainer: toInt(r[2]),
    }));

    return {
      headers: hdr,
      rows: rest,
      chartData: parsed.map<ChartPoint>((d) => ({ name: d.month, Umsatz: d.revenue })),
      totalRevenue: parsed.reduce((a, b) => a + b.revenue, 0),   // €4,808 with your sample
      totalMRRSigned: parsed.reduce((a, b) => a + b.retainer, 0) // €128 p.M
    };
  }, [values]);

  return (
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Total Revenue (12 months)</div>
            <div className="text-2xl font-semibold mt-1">{fmtEUR(totalRevenue)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Total Recurring Signed (p.M)</div>
            <div className="text-2xl font-semibold mt-1">{fmtEUR(totalMRRSigned)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Range: {range || '—'}</div>
          <button onClick={load} className="text-sm px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50" disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && <div className="text-red-600 text-sm border border-red-200 bg-red-50 px-3 py-2 rounded-md">{error}</div>}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Table (left) */}
          <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <tbody>
              {(!rows.length && !loading) && (
                  <tr><td className="p-4 text-slate-500">No revenue data.</td></tr>
              )}
              {headers.length > 0 && (
                  <tr className="bg-slate-50 font-medium">
                    {headers.map((h, i) => (
                        <td key={i} className="p-2 border-t border-slate-100 whitespace-nowrap">{h}</td>
                    ))}
                  </tr>
              )}
              {rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                        <td key={j} className="p-2 border-t border-slate-100 whitespace-nowrap">
                          {j === 1 || j === 2 ? fmtEUR(toInt(cell)) : cell}
                        </td>
                    ))}
                  </tr>
              ))}
              </tbody>
            </table>
          </div>

          {/* Chart (right) */}
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={tooltipFormatter} />
                  <Bar dataKey="Umsatz" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
  );
}