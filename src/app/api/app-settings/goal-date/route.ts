import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

export async function GET() {
    const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'short_videos_goal_date')
        .maybeSingle()
    if (error) return new NextResponse(error.message, { status: 500 })
    return NextResponse.json({ value: data?.value ?? null })
}

export async function POST(req: Request) {
    const { value } = await req.json().catch(() => ({}))
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return new NextResponse('Invalid date (YYYY-MM-DD)', { status: 400 })

    const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'short_videos_goal_date', value }, { onConflict: 'key' })
    if (error) return new NextResponse(error.message, { status: 500 })
    return NextResponse.json({ ok: true })
}
