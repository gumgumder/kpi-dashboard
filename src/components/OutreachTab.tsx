// app/(dashboard)/kpi/outreach/page.tsx
'use client';
import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';

type ApiResp = { range: string; values: string[][] };

function parseDateMMDDYYYY(s: string): Date | null {
  const m = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(+d) ? null : d;
}
function isoWeekYear(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((+d - +yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}
function fmtRangeShort(start: Date, end: Date) {
  const m = (dt: Date) => dt.toLocaleString('de-AT', { month: 'short' }).replace('.', '');
  const sameM = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return sameM
      ? `${start.getDate()}–${end.getDate()} ${m(start)} ${start.getFullYear()}`
      : `${start.getDate()} ${m(start)} ${start.getFullYear()} – ${end.getDate()} ${m(end)} ${end.getFullYear()}`;
}
function pad2(n:number){ return String(n).padStart(2,'0'); }
function labelMondayMMDDYYYY(d: Date){
  const weekday = d.toLocaleDateString('en-US',{ weekday:'long' }); // explicit English
  return `${weekday}, ${pad2(d.getMonth()+1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}

export default function OutreachTab() {
  const [range, setRange] = useState('');
  const [values, setValues] = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const data: ApiResp = await res.json();
      setRange(data.range);
      setValues(data.values);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const headers = values[0] ?? [];
  const rows = values.slice(1);

  const groups = useMemo(() => {
    type G = {
      key: string; year: number; week: number;
      start: Date; end: Date;
      rows: string[][];
      sums: number[]; // per column
    };
    const map = new Map<string, G>();
    for (const r of rows) {
      const d = parseDateMMDDYYYY(r[0] ?? '');
      if (!d) continue;
      const { year, week } = isoWeekYear(d);
      const k = `${year}-W${String(week).padStart(2,'0')}`;
      if (!map.has(k)) map.set(k, { key: k, year, week, start: d, end: d, rows: [], sums: Array(headers.length).fill(0) });
      const g = map.get(k)!;
      g.rows.push(r);
      if (d < g.start) g.start = d;
      if (d > g.end) g.end = d;
      // sum all numeric columns except date col (A)
      for (let ci = 1; ci < headers.length; ci++) {
        const n = parseFloat((r[ci] ?? '').toString().replace(',', '.'));
        if (!isNaN(n)) g.sums[ci] += n;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year || a.week - b.week);
  }, [rows, headers.length]);

  // default: only latest week expanded
  useEffect(() => {
    if (!groups.length) return;
    setExpanded(Object.fromEntries(groups.map((g, i) => [g.key, i === groups.length - 1])));
  }, [groups.length]);

  const toggleWeek = (key: string) => setExpanded((s) => ({ ...s, [key]: !s[key] }));

  return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Range: {range || '—'}</div>
          <div className="flex gap-2">
            <button
                onClick={load}
                className="text-sm px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50"
                disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <a
                href="/api/sheet-link?doc=outreach"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm px-3 py-1.5 rounded-md border bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              Edit in Google Sheets
            </a>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border w-full">
          <table className="min-w-full w-full text-sm">
            <thead className="bg-slate-100">
            <tr>
              {headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-medium text-slate-700 border-b">{h}</th>
              ))}
            </tr>
            </thead>

            <tbody>
            {groups.length === 0 && (
                <tr><td className="px-3 py-6 text-slate-500" colSpan={headers.length || 1}>No data</td></tr>
            )}

            {groups.map((g, gi) => {
              const zebra = gi % 2 === 0 ? 'bg-white' : 'bg-slate-100';
              const rangeShort = fmtRangeShort(g.start, g.end);

              return (
                  <Fragment key={g.key}>
                    {/* Weekly summary row (top) */}
                    <tr className={`${zebra} border-b align-middle`}>
                      {headers.map((_, ci) => {
                        if (ci === 0) {
                          return (
                              <td key={ci} className="px-3 py-2 font-semibold text-slate-800">
                                <div className="flex items-center gap-3">
                                  <button
                                      onClick={() => toggleWeek(g.key)}
                                      className="px-2 py-1 rounded-md border hover:bg-slate-50 text-xs"
                                      aria-expanded={!!expanded[g.key]}
                                      aria-controls={`week-${g.key}`}
                                  >
                                    {expanded[g.key] ? '▾' : '▸'}
                                  </button>
                                  <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-700 text-white text-xs">
                                {`KW ${g.week}`}
                              </span>
                                  <span className="text-slate-600 text-xs">{rangeShort}</span>
                                </div>
                              </td>
                          );
                        }
                        const sum = g.sums[ci];
                        // Column B emphasized; others subtle
                          if (ci === 1) {
                              const valB = Number.isFinite(sum) ? (Number.isInteger(sum) ? sum : sum.toFixed(2)) : 0;
                              return (
                                  <td key={ci} className="px-3 py-2">
      <span className="inline-flex px-2 py-0.5 rounded bg-amber-200 text-amber-900 text-xs font-bold">
        {valB}
      </span>
                                  </td>
                              );
                          }
                          const val = Number.isFinite(sum) ? (Number.isInteger(sum) ? sum : sum.toFixed(2)) : 0;
                        return (
                            <td key={ci} className="px-3 py-2 text-slate-600 text-xs font-medium">
                              {val}
                            </td>
                        );
                      })}
                    </tr>

                    {/* Daily rows (collapsible) */}
                    {expanded[g.key] && g.rows.map((r, ri) => (
                        <tr key={`${g.key}-r-${ri}`} id={ri === 0 ? `week-${g.key}` : undefined} className={`${zebra} border-b`}>
                            {headers.map((_, ci) => {
                                let cell = r[ci] ?? '';
                                if (ci === 0) {
                                    const d = parseDateMMDDYYYY(r[0] ?? '');
                                    if (d) cell = labelMondayMMDDYYYY(d);
                                }
                                return (
                                    <td key={ci} className={`px-3 py-2 whitespace-nowrap ${ci === 0 ? 'border-l-4 border-l-slate-300' : ''}`}>
                                        {cell}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}

                    {/* Optional weekly totals row inside expanded group */}
                    {expanded[g.key] && (
                        <tr className={`${zebra} border-b`}>
                          {headers.map((_, ci) => (
                              <td key={ci} className={`px-3 py-2 font-semibold ${ci === 0 ? 'text-slate-700' : 'text-slate-700'}`}>
                                  {ci === 0 ? 'Wochensumme'
                                      : (Number.isFinite(g.sums[ci]) ? (Number.isInteger(g.sums[ci]) ? g.sums[ci] : g.sums[ci].toFixed(2)) : 0)}
                              </td>
                          ))}
                        </tr>
                    )}
                  </Fragment>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>
  );
}
