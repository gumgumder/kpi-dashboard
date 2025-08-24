// src/app/api/route.ts
import { NextRequest, NextResponse } from 'next/server'

type StatusName = string
type ByStatus = Record<StatusName, number>
type ItemsByStatus = Record<StatusName, string[]>

type NotionStatusProp =
    | { status?: { name?: string | null } | null }
    | { select?: { name?: string | null } | null }

interface NotionIDProp {
    number?: number | null
    title?: Array<{ plain_text: string }>
    rich_text?: Array<{ plain_text: string }>
    unique_id?: { number?: number | null }
}

interface NotionPage {
    id: string
    created_time?: string
    last_edited_time?: string
    properties?: {
        Status?: NotionStatusProp
        ID?: NotionIDProp
        Filmart?: { select?: { name?: string | null } | null }
    }
}

interface NotionQueryResponse {
    results: NotionPage[]
    has_more: boolean
    next_cursor: string | null
}

function getStatusName(page: NotionPage): string {
    const p = page.properties?.Status
    const name =
        (p as { status?: { name?: string | null } })?.status?.name ??
        (p as { select?: { name?: string | null } })?.select?.name
    return name || 'Unknown'
}

function getCustomId(page: NotionPage): string {
    const idProp = page.properties?.ID
    if (!idProp) return page.id
    if (typeof idProp.number === 'number') return String(idProp.number)
    if (Array.isArray(idProp.title) && idProp.title[0]?.plain_text) return idProp.title[0].plain_text
    if (Array.isArray(idProp.rich_text) && idProp.rich_text[0]?.plain_text) return idProp.rich_text[0].plain_text
    if (typeof idProp.unique_id?.number === 'number') return String(idProp.unique_id.number)
    return page.id
}

function getFilmartName(page: NotionPage): string | null {
    const sel = page.properties?.Filmart?.select?.name
    return (sel && sel.trim()) ? sel : null
}

export async function GET(req: NextRequest) {
    // Optional mock: /api?mock=1
    const url = new URL(req.url)
    if (url.searchParams.get('mock') === '1') {
        return NextResponse.json({
            total: 4,
            byStatus: { Draft: 1, Editing: 1, Published: 2 },
            itemsByStatus: { Draft: ['101'], Editing: ['102'], Published: ['103', '104'] },
            lastUpdated: new Date().toISOString(),
        })
    }

    const dbId = process.env.NOTION_VIDEOS_DB_ID
    const token = process.env.NOTION_SECRET
    if (!dbId || !token) return new NextResponse('Missing NOTION_VIDEOS_DB_ID or NOTION_SECRET', { status: 500 })

    const byStatus: ByStatus = {}
    const itemsByStatus: ItemsByStatus = {}
    const filmartById: Record<string, string> = {}
    let lastEdited = 0
    let cursor: string | undefined

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

        const data: NotionQueryResponse = await res.json()
        for (const page of data.results) {
            const status = getStatusName(page)
            byStatus[status] = (byStatus[status] || 0) + 1

            const itemId = getCustomId(page)
            if (!itemsByStatus[status]) itemsByStatus[status] = []
            itemsByStatus[status].push(itemId)

            const filmart = getFilmartName(page)
            if (filmart) filmartById[itemId] = filmart

            const ts = Date.parse(page.last_edited_time ?? page.created_time ?? '')
            if (!Number.isNaN(ts)) lastEdited = Math.max(lastEdited, ts)
        }

        cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined
    } while (cursor)

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
    return NextResponse.json({
        total,
        byStatus,
        itemsByStatus,
        filmartById,
        lastUpdated: lastEdited ? new Date(lastEdited).toISOString() : null,
    })
}
