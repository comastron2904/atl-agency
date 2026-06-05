import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Gemini 호출은 브라우저에서 직접 — 여기서는 결과를 Supabase에만 저장
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { lesson, grade, selectedTypes, selectedATLs, gemsInstruction, parsed } = body

    const supabase = getSupabaseAdmin()
    const { error: dbError } = await supabase.from('atl_recommendations').insert({
      lesson_description: lesson || '',
      lesson_types: selectedTypes || [],
      grade: grade || '',
      atl_categories: selectedATLs || [],
      gems_instruction: gemsInstruction || null,
      summary: parsed?.summary || '',
      recommendations: parsed?.recommendations || [],
      used_files: parsed?.usedFiles || [],
    })
    if (dbError) console.error('Supabase insert error:', dbError.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
