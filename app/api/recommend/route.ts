import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { lesson, grade, selectedTypes, selectedATLs, gemsInstruction, parts } = body

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
    }

    // 파일 파트에서 텍스트만 추출 (Claude는 PDF를 base64 document로 처리)
    const claudeContent: any[] = []

    for (const part of (parts as any[])) {
      if (part.inlineData) {
        // PDF → Claude document block
        claudeContent.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: part.inlineData.mimeType,
            data: part.inlineData.data,
          },
        })
      } else if (part.text) {
        claudeContent.push({ type: 'text', text: part.text })
      }
    }

    const typeStr = (selectedTypes || []).join(', ') || '명시되지 않음'
    const atlStr  = (selectedATLs  || []).join(', ') || '전체 범주'
    const gemsBlock = gemsInstruction
      ? `\n[답변 방향성 지침 — 반드시 준수]\n${gemsInstruction}\n`
      : ''

    // 프롬프트가 parts에 이미 포함되어 있으므로 그대로 사용
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2500,
        system: `당신은 IB(국제바칼로레아) 교육 전문가입니다. 반드시 순수 JSON만 응답하세요. 마크다운 코드블록 없이 JSON 객체만 반환하세요.${gemsBlock}`,
        messages: [{ role: 'user', content: claudeContent }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: (err as any)?.error?.message || `Claude API HTTP ${claudeRes.status}` },
        { status: claudeRes.status }
      )
    }

    const claudeData = await claudeRes.json()
    const raw: string = claudeData?.content?.[0]?.text || ''
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // Supabase 저장
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
    if (dbError) console.error('Supabase insert error:', dbError.message)

    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '알 수 없는 오류' }, { status: 500 })
  }
}
