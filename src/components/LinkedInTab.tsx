'use client';

import { useEffect, useState } from 'react';

export default function LinkedInTab() {
  const [values, setValues] = useState<string[][]>([]);
  const [range, setRange] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/google-sheets');
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setValues(json.values ?? []);
      setRange(json.range ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load Google Sheets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">Range: {range || '—'}</div>
        <button
          onClick={load}
          className="text-sm px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="text-red-600 text-sm border border-red-200 bg-red-50 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      {!error && (
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <tbody>
              {values.length === 0 && !loading && (
                <tr>
                  <td className="p-4 text-slate-500">No data.</td>
                </tr>
              )}
              {values.map((row, i) => (
                <tr key={i} className={i === 0 ? 'bg-slate-50 font-medium' : ''}>
                  {row.map((cell, j) => (
                    <td key={j} className="p-2 border-t border-slate-100 whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
