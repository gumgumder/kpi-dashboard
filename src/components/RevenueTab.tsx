'use client';

import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Legend } from 'recharts';

type ValuesResponse = { range: string; values: (string | number)[][] };
type ChartPoint = { name: string; beyondAI: number; MedicMedia: number; UpWork: number };

const fmtEUR = (n: number) =>
    new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const monthNamesShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const currentMonthIdx = new Date().getMonth(); // 0-based
const avgRangeLabel = `Jan-${monthNamesShort[currentMonthIdx]}`;

function toNumEU(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, '');
  const n = Number.parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

type RechartsValue = number | string | Array<number | string>;
const tooltipFmt = (value: RechartsValue) => {
  const num = Array.isArray(value)
      ? Number(value[0])
      : typeof value === 'number'
          ? value
          : toNumEU(value);
  return fmtEUR(Number.isFinite(num) ? num : 0);
};

function fromSerial(serial: number): Date {
  const base = new Date(Date.UTC(1899, 11, 30));
  return new Date(base.getTime() + serial * 86400000);
}

const tryParseDate = (raw: unknown): Date | null => {
  if (typeof raw === 'number') return fromSerial(raw);
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const dd = +m[1], mm0 = +m[2] - 1, yyyy = m[3].length === 2 ? +('20' + m[3]) : +m[3];
    const d = new Date(yyyy, mm0, dd);
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
};

// A=date, C=business, D/E=signed, F/G=cash
const COL = { date: 0, business: 2, signed1: 3, signed2: 4, cash1: 5, cash2: 6 } as const;

// normalize business labels
const normalizeBiz = (raw: unknown): 'beyondAI' | 'MedicMedia' | 'UpWork' | 'Other' => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (/^beyond\s*ai$/.test(s)) return 'beyondAI';
  if (/^medic\s*media$/.test(s)) return 'MedicMedia';
  if (/^up\s*work$/.test(s) || s === 'upwork') return 'UpWork';
  return 'Other';
};

export default function RevenueTab() {
  const [values, setValues] = useState<(string | number)[][]>([]);
  const [range, setRange] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extended, setExtended] = useState(false);

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

  const { chartData, cashChartData, totalSigned, totalCash, averageSigned, averageCollected, monthlyRows } = useMemo(() => {
    if (!values.length) {
      return {
        chartData: [] as ChartPoint[],
        cashChartData: [] as ChartPoint[],
        totalSigned: 0,
        totalCash: 0,
        averageSigned: 0,
        averageCollected: 0,
        monthlyRows: [] as {
          monthLabel: string;
          totalRev: number; cashCollected: number;
          r_bai: number; r_mm: number; r_up: number;
          c_bai: number; c_mm: number; c_up: number;
        }[],
      };
    }

    const [, ...rest] = values; // ignore header safely

    type Bucket = {
      revTotal: number;
      cashTotal: number;
      revByBiz:  { beyondAI: number; MedicMedia: number; UpWork: number; Other: number };
      cashByBiz: { beyondAI: number; MedicMedia: number; UpWork: number; Other: number };
    };

    const keyFor = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const buckets = new Map<string, Bucket>();

    for (const r of rest) {
      const d = tryParseDate(r[COL.date]); if (!d) continue;
      const k = keyFor(new Date(d.getFullYear(), d.getMonth(), 1));

      const signed = toNumEU(r[COL.signed1]) + toNumEU(r[COL.signed2]);
      const cash   = toNumEU(r[COL.cash1])   + toNumEU(r[COL.cash2]);
      const biz = normalizeBiz(r[COL.business]);

      const b = buckets.get(k) ?? {
        revTotal: 0, cashTotal: 0,
        revByBiz:   { beyondAI: 0, MedicMedia: 0, UpWork: 0, Other: 0 },
        cashByBiz:  { beyondAI: 0, MedicMedia: 0, UpWork: 0, Other: 0 },
      };

      if (signed > 0) { b.revTotal += signed;  b.revByBiz[biz]  += signed; }
      if (cash   > 0) { b.cashTotal += cash;   b.cashByBiz[biz] += cash; }

      buckets.set(k, b);
    }

    const year = new Date().getFullYear();
    const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

    type Row7 = {
      monthLabel: string;
      totalRev: number; cashCollected: number;
      r_bai: number; r_mm: number; r_up: number;
      c_bai: number; c_mm: number; c_up: number;
    };

    const chart: ChartPoint[] = [];
    const cashChart: ChartPoint[] = [];
    const monthlyRows: Row7[] = [];
    let totalSigned = 0, totalCash = 0, averageSigned = 0, averageCollected = 0;

    for (let m0 = 0; m0 < 12; m0++) {
      const k = `${year}-${String(m0 + 1).padStart(2, '0')}`;
      const b = buckets.get(k);

      const rev  = b?.revTotal  ?? 0;
      const cash = b?.cashTotal ?? 0;

      monthlyRows.push({
        monthLabel: `${MONTHS[m0]} ${year}`,
        totalRev: rev,
        cashCollected: cash,
        r_bai: b?.revByBiz.beyondAI ?? 0,
        r_mm:  b?.revByBiz.MedicMedia ?? 0,
        r_up:  b?.revByBiz.UpWork ?? 0,
        c_bai: b?.cashByBiz.beyondAI ?? 0,
        c_mm:  b?.cashByBiz.MedicMedia ?? 0,
        c_up:  b?.cashByBiz.UpWork ?? 0,
      });

      // signed chart
      chart.push({
        name: MONTHS[m0],
        beyondAI: b?.revByBiz.beyondAI ?? 0,
        MedicMedia: b?.revByBiz.MedicMedia ?? 0,
        UpWork: b?.revByBiz.UpWork ?? 0,
      });

      // cash chart  (NEW)
      cashChart.push({
        name: MONTHS[m0],
        beyondAI: b?.cashByBiz.beyondAI ?? 0,
        MedicMedia: b?.cashByBiz.MedicMedia ?? 0,
        UpWork: b?.cashByBiz.UpWork ?? 0,
      });

      totalSigned += rev;
      totalCash += cash;
    }

    const monthsSoFar = Math.max(1, new Date().getMonth() + 1);
    averageSigned = totalSigned / monthsSoFar;
    averageCollected = totalCash / monthsSoFar;

    return { chartData: chart, cashChartData: cashChart, totalSigned, totalCash, averageSigned, averageCollected, monthlyRows };
  }, [values]);

  return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Range: {range || '—'}</div>
          <div>
            <button
                onClick={() => setExtended(e => !e)}
                className="text-sm px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50 mr-2"
            >
              {extended ? 'Collapse' : 'Expand details'}
            </button>
            <button onClick={load} className="text-sm px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50" disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <a
                href="/api/sheet-link?doc=outreach"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm px-3 py-1.5 rounded-md border bg-green-50 text-green-700 hover:bg-green-100 ml-2"
            >
              Edit in Google Sheets
            </a>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Total Signed (2025)</div>
            <div className="text-2xl font-semibold mt-1">{fmtEUR(totalSigned)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Average Signed p.M. {avgRangeLabel}</div>
            <div className="text-2xl font-semibold mt-1">{fmtEUR(averageSigned)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Total Cash collected (2025)</div>
            <div className="text-2xl font-semibold mt-1">{fmtEUR(totalCash)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Average Cash collected p.M. {avgRangeLabel}</div>
            <div className="text-2xl font-semibold mt-1">{fmtEUR(averageCollected)}</div>
          </div>
        </div>

        {error && <div className="text-red-600 text-sm border border-red-200 bg-red-50 px-3 py-2 rounded-md">{error}</div>}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Static monthly list */}
          <div className="overflow-auto rounded-lg border border-slate-200 bg-white self-start">
            <table className="min-w-full text-sm">
              <thead>
              {!extended ? (
                  <tr className="bg-slate-50 font-medium">
                    <th className="p-2 text-left">Month</th>
                    <th className="p-2 text-center">Total Rev</th>
                    <th className="p-2 text-center">Cash Collected</th>
                  </tr>
              ) : (
                  <tr className="bg-slate-50 font-medium">
                    <th className="p-2 text-left">Month</th>
                    <th className="p-2 text-left border-l-2 border-slate-200">Revenue</th>
                    <th className="p-2 text-right">beyond AI</th>
                    <th className="p-2 text-right">MedicMedia</th>
                    <th className="p-2 text-right">UpWork</th>
                    <th className="p-2 text-right border-l-2 border-slate-200">Cash collected</th>
                    <th className="p-2 text-right">beyond AI</th>
                    <th className="p-2 text-right">MedicMedia</th>
                    <th className="p-2 text-right">UpWork</th>
                  </tr>
              )}
              </thead>
              <tbody>
              {!extended
                  ? monthlyRows.map(r => (
                      <tr key={r.monthLabel}>
                        <td className="p-2 border-t border-slate-100">{r.monthLabel}</td>
                        <td className="p-2 border-t border-slate-100 text-center">{fmtEUR(r.totalRev)}</td>
                        <td className="p-2 border-t border-slate-100 text-center">{fmtEUR(r.cashCollected)}</td>
                      </tr>
                  ))
                  : monthlyRows.map(r => (
                      <tr key={r.monthLabel}>
                        <td className="p-2 border-t border-slate-100">{r.monthLabel}</td>

                        {/* vertical line BEFORE main Revenue */}
                        <td className="p-2 border-t border-slate-100 text-right font-medium border-l-2 border-slate-200">
                          {fmtEUR(r.totalRev)}
                        </td>
                        <td className="p-2 border-t border-slate-100 text-right">{fmtEUR(r.r_bai)}</td>
                        <td className="p-2 border-t border-slate-100 text-right">{fmtEUR(r.r_mm)}</td>
                        <td className="p-2 border-t border-slate-100 text-right">{fmtEUR(r.r_up)}</td>

                        {/* vertical line BEFORE main Cash collected */}
                        <td className="p-2 border-t border-slate-100 text-right font-medium border-l-2 border-slate-200">
                          {fmtEUR(r.cashCollected)}
                        </td>
                        <td className="p-2 border-t border-slate-100 text-right">{fmtEUR(r.c_bai)}</td>
                        <td className="p-2 border-t border-slate-100 text-right">{fmtEUR(r.c_mm)}</td>
                        <td className="p-2 border-t border-slate-100 text-right">{fmtEUR(r.c_up)}</td>
                      </tr>
                  ))
              }
              </tbody>
            </table>
          </div>

          {/* Chart (right) */}
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="px-3 pt-2 pb-1 text-sm font-medium text-slate-800">Revenue signed</div>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} minTickGap={0} angle={-45} textAnchor="end" height={70} tickMargin={6} tick={{ fontSize: 15 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={tooltipFmt} />
                  <Legend verticalAlign="top" height={28} />
                  <Bar dataKey="beyondAI"   name="beyond AI"  stackId="rev" fill="#8ff760" />
                  <Bar dataKey="MedicMedia" name="MedicMedia" stackId="rev" fill="#51A5C5" />
                  <Bar dataKey="UpWork"     name="UpWork"     stackId="rev" fill="#000000" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Cash collected chart */}
              <div className="px-3 pt-2 pb-1 text-sm font-medium text-slate-800">Cash collected</div>
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" interval={0} minTickGap={0} angle={-45} textAnchor="end" height={70} tickMargin={6} tick={{ fontSize: 15 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={tooltipFmt} />
                    <Legend verticalAlign="top" height={28} />
                    <Bar dataKey="beyondAI"   name="beyond AI"  stackId="cash" fill="#8ff760" />
                    <Bar dataKey="MedicMedia" name="MedicMedia" stackId="cash" fill="#51A5C5" />
                    <Bar dataKey="UpWork"     name="UpWork"     stackId="cash" fill="#000000" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </div>
        </div>
      </div>
  );
}