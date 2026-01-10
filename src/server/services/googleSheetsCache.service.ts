// src/server/services/googleSheetsCache.service.ts
import 'server-only';
import type { ValuesResponse } from '../sources/googleSheets.api';
import { getRevenueValues } from '../sources/googleSheets.api';

const FRESH_TTL_MS = Number(process.env.FRESH_TTL_MS || 0);
const STALE_TTL_MS = Number(process.env.STALE_TTL_MS || 0);

type CacheEntry = { data: ValuesResponse; ts: number };
const cacheByYear = new Map<string, CacheEntry>();
const inflightByYear = new Map<string, Promise<ValuesResponse>>();

export async function getRevenueValuesCached(year: string): Promise<ValuesResponse> {
    const now = Date.now();

    const cached = cacheByYear.get(year);
    if (cached && now - cached.ts < FRESH_TTL_MS) return cached.data;

    const inflight = inflightByYear.get(year);
    if (inflight) return inflight;

    const p = (async () => {
        try {
            const payload = await getRevenueValues(year);
            cacheByYear.set(year, { data: payload, ts: Date.now() });
            return payload;
        } catch (e: unknown) {
            const stale = cacheByYear.get(year);
            if (stale && now - stale.ts < STALE_TTL_MS) return stale.data;
            throw e;
        } finally {
            inflightByYear.delete(year);
        }
    })();

    inflightByYear.set(year, p);
    return p;
}