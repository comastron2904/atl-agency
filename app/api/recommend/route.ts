import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 서버 전용 Supabase (service_role key — RLS 우회 저장용)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      lesson,
      grade,
      selectedTypes,
      selectedATLs,
      gemsInstruction,
      parts, // Gemini content parts (text + optional base64 PDF)
    } = body

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
    }

    // ── Gemini 호출 ──
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 2500 },
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: (err as any)?.error?.message || `Gemini HTTP ${geminiRes.status}` },
        { status: geminiRes.status }
      )
    }

    const geminiData = await geminiRes.json()
    const raw: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // ── Supabase 저장 ──
    const supabase = getSupabaseAdmin()
    const { error: dbError } = await supabase.from('atl_recommendations').insert({
      lesson_description: lesson || '',
      lesson_types: selectedTypes || [],
      grade: grade || '',
      atl_categories: selectedATLs || [],
      gems_instruction: gemsInstruction || null,
      summary: parsed.summary || '',
      recommendations: parsed.recommendations || [],
      used_files: parsed.usedFiles || [],
    })

    if (dbError) {
      console.error('Supabase insert error:', dbError.message)
      // DB 저장 실패해도 결과는 반환
    }

    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '알 수 없는 오류' }, { status: 500 })
  }
}
