// app/(dashboard)/kpi/outreach/page.tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
type ApiResp = { range: string; values: string[][] };

export default function OutreachTab() {
  const [range, setRange] = useState(''); const [values, setValues] = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const data: ApiResp = await res.json();
      setRange(data.range); setValues(data.values);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const headers = values[0] ?? []; const rows = values.slice(1);

  return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Range: {range || '—'}</div>
          <div>
            <button onClick={load} className="text-sm px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50" disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <a href="/api/sheet-link?doc=outreach" target="_blank" rel="noopener noreferrer"
               className="text-sm px-3 py-1.5 rounded-md border bg-green-50 text-green-700 hover:bg-green-100 ml-2">
              Edit in Google Sheets
            </a>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border w-2/3">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
            <tr>{headers.map((h, i) => <th key={i} className="px-3 py-2 text-left font-medium text-slate-700 border-b">{h}</th>)}</tr>
            </thead>
            <tbody>
            {rows.length ? rows.map((r, ri) => (
                <tr key={ri} className="odd:bg-white even:bg-slate-50">
                  {headers.map((_, ci) => <td key={ci} className="px-3 py-2 border-b whitespace-nowrap">{r[ci] ?? ''}</td>)}
                </tr>
            )) : <tr><td className="px-3 py-6 text-slate-500" colSpan={headers.length || 1}>No data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
  );
}
