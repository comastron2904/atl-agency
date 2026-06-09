import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/recommend — Gemini 호출 후 결과를 DB에 저장하고 반환
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prompt, lesson, grade, selectedTypes, selectedATLs, gemsInstruction, gemsText } = body

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 })

    // Gemini 호출 (최대 3회 재시도)
    let res: Response | null = null
    const geminiBody = JSON.stringify({
      model: 'gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: [
            '당신은 IB 교육 전문가입니다.',
            '반드시 순수 JSON만 응답하세요. 마크다운 코드블록 없이 JSON 객체만 반환하세요.',
            gemsText?.trim()
              ? '사용자 메시지 최상단의 [GEMS 답변 지침]은 최우선 지시사항입니다. JSON의 모든 텍스트 필드(summary, description, reason, activities)를 해당 지침에 명시된 언어 수준·분량·형식에 맞게 작성하세요.'
              : '',
          ].filter(Boolean).join(' '),
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.35,
      max_tokens: 8000,
    })

    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: geminiBody,
      })
      if (res.status !== 503) break
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt))
    }

    const data = await res!.json()
    if (!res!.ok) throw new Error(data?.error?.message || `HTTP ${res!.status}`)

    const raw: string = data?.choices?.[0]?.message?.content || ''
    if (!raw) throw new Error(`AI 응답이 비어있습니다.`)

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error(`JSON을 찾을 수 없습니다. 응답: ${raw.slice(0, 200)}`)

    const parsed = JSON.parse(jsonMatch[0])

    // DB 저장
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

    return NextResponse.json({ parsed })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
