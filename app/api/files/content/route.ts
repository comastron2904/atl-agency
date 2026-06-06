import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

const BUCKET = 'knowledge-base'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/files/content?name=파일명
// Storage에서 파일을 읽어 base64 + 파싱된 텍스트(content) 모두 반환
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
      const buffer = Buffer.from(await data.arrayBuffer())
      const base64 = buffer.toString('base64')
      // PDF 텍스트 추출 — URL 파싱에 사용
      let content: string | null = null
      try {
        const parsed = await pdfParse(buffer)
        content = parsed.text
      } catch {
        content = null
      }
      return NextResponse.json({ name, isPdf: true, base64, mimeType: 'application/pdf', content })
    } else {
      const text = await data.text()
      return NextResponse.json({ name, isPdf: false, content: text })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
