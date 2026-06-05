import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'knowledge-base'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET — 저장된 파일 목록 반환
export async function GET() {
  try {
    const supabase = adminClient()
    const { data, error } = await supabase.storage.from(BUCKET).list('', {
      sortBy: { column: 'created_at', order: 'desc' },
    })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — 파일 업로드 (multipart/form-data)
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const supabase = adminClient()

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(file.name, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true, // 같은 이름이면 덮어쓰기
      })
    if (error) throw error

    // 서명된 URL (1시간 유효) — Gemini base64 전달용
    const { data: urlData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.name, 3600)

    return NextResponse.json({ name: file.name, size: file.size, url: urlData?.signedUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — 파일 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { name } = await req.json()
    if (!name) return NextResponse.json({ error: '파일명이 없습니다.' }, { status: 400 })

    const supabase = adminClient()
    const { error } = await supabase.storage.from(BUCKET).remove([name])
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
