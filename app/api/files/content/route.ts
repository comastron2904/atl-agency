import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'knowledge-base'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/files/content?name=파일명
// Storage에서 파일을 읽어 base64 또는 텍스트로 반환
export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get('name')
    if (!name) return NextResponse.json({ error: '파일명이 없습니다.' }, { status: 400 })

    const supabase = adminClient()
    const { data, error } = await supabase.storage.from(BUCKET).download(name)
    if (error) throw error

    const ext = name.split('.').pop()?.toLowerCase()
    const isPdf = ext === 'pdf'

    if (isPdf) {
      const buffer = await data.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      return NextResponse.json({ name, isPdf: true, base64, mimeType: 'application/pdf' })
    } else {
      const text = await data.text()
      return NextResponse.json({ name, isPdf: false, content: text })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
