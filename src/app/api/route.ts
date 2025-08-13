// Server-only: Next.js App Router route
import { NextResponse } from 'next/server'

type ByStatus = Record<string, number>

function getStatusName(page: any): string {
    const p = page?.properties?.Status
    const name =
        p?.status?.name ??
        p?.select?.name ??
        'Unknown'
    return name || 'Unknown'
}

function getCustomId(page: any): string {
    const p = page?.properties?.ID
    if (!p) return page.id // fallback to Notion page id
    // Handle common Notion property types
    if (typeof p.number === 'number') return String(p.number)
    if (Array.isArray(p.title) && p.title[0]?.plain_text) return p.title[0].plain_text
    if (Array.isArray(p.rich_text) && p.rich_text[0]?.plain_text) return p.rich_text[0].plain_text
    if (typeof p.unique_id?.number === 'number') return String(p.unique_id.number) // Unique ID (Notion)
    return page.id
}

export async function GET(req: Request) {
    // Simple test endpoint: /api/notion/short-videos/stats?mock=1
    const { searchParams } = new URL(req.url)
    if (searchParams.get('mock')) {
        return NextResponse.json({
            total: 4,
            byStatus: { Draft: 1, Editing: 1, Published: 2 },
            itemsByStatus: { Draft: ['101'], Editing: ['102'], Published: ['103','104'] },
            lastUpdated: new Date().toISOString(),
        })
    }

    const dbId = process.env.NOTION_VIDEOS_DB_ID
    const token = process.env.NOTION_SECRET
    if (!dbId || !token) {
        return new NextResponse('Missing NOTION_VIDEOS_DB_ID or NOTION_SECRET', { status: 500 })
    }

    const byStatus: ByStatus = {}
    const itemsByStatus: Record<string, string[]> = {}
    let lastEdited = 0
    let cursor: string | undefined

    // Paginate through all rows
    do {
        const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
        })
        if (!res.ok) {
            const txt = await res.text()
            return new NextResponse(`Notion error: ${txt}`, { status: 502 })
        }

        const data = await res.json()
        const results: any[] = data.results ?? []

        for (const page of results) {
            const status = getStatusName(page)
            byStatus[status] = (byStatus[status] || 0) + 1

            const itemId = getCustomId(page)
            if (!itemsByStatus[status]) itemsByStatus[status] = []
            itemsByStatus[status].push(itemId)

            const ts = Date.parse(page.last_edited_time ?? page.created_time ?? '')
            if (!Number.isNaN(ts)) lastEdited = Math.max(lastEdited, ts)
        }

        cursor = data.has_more ? data.next_cursor : undefined
    } while (cursor)

    return NextResponse.json({
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        byStatus,
        itemsByStatus, // available if you want to render IDs later
        lastUpdated: lastEdited ? new Date(lastEdited).toISOString() : null,
    })
}