// src/lib/metrics/summarize.ts
export type DayRow = { date: string; sums: number[] };
export type WeekAgg = { days: DayRow[] };
export type TabAgg = { headersOut: string[]; weeks: WeekAgg[] };

// types assumed from your route.ts: TabAgg, WeekAgg, DayRow
export function summarizePeriod(
    tab: { headersOut: string[]; weeks: { days: { date: string; sums: number[] }[] }[] },
    start: string | Date,
    end: string | Date,
    params: (string | number)[]
): Record<string, number> {
    const toDateOnly = (v: string | Date) => {
        const d = typeof v === 'string' ? new Date(v) : new Date(v);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    };
    let s = toDateOnly(start);
    let e = toDateOnly(end);
    if (+s > +e) [s, e] = [e, s];

    // resolve param -> column index (number or header name)
    const indices = params.map(p => typeof p === 'number' ? p : tab.headersOut.indexOf(p));

    const result: Record<string, number> = {};
    params.forEach((p, i) => {
        const key = typeof p === 'number' ? String(p) : p;
        result[key] = 0;
    });

    for (const wk of tab.weeks ?? []) {
        for (const day of wk.days ?? []) {
            const dd = toDateOnly(day.date);
            if (+dd < +s || +dd > +e) continue;
            for (let i = 0; i < params.length; i++) {
                const col = indices[i];
                if (col == null || col < 0) continue; // unresolved param -> skip
                const val = Number(day.sums[col] ?? 0);
                result[typeof params[i] === 'number' ? String(params[i]) : params[i]] += isNaN(val) ? 0 : val;
            }
        }
    }

    // round to 2 decimal places
    for (const k of Object.keys(result)) {
        result[k] = Math.round(result[k] * 100) / 100;
    }
    return result;
}

// TypeScript
export function summarizePeriodTotals(
    tab: { headersOut: string[]; weeks: { days: { date: string; sums: number[] }[] }[] },
    start: string | Date,
    end: string | Date,
    params: (string | number)[]
): Record<string, number> {
    const totals = summarizePeriod(tab, start, end, params);
    const out: Record<string, number> = {};
    for (const p of params) {
        const key = typeof p === 'number' ? String(p) : p;
        out[key] = totals[key] ?? 0;
    }
    return out;
}