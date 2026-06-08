import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

const BUCKET = 'knowledge-base'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ATL 섹션 경계 정의
const ATL_SECTIONS: Record<string, { start: RegExp; end: RegExp | null }> = {
  '의사소통기능': { start: /1\.1의사소통\s*기능/,  end: /#2\.\s*대인관계/ },
  '대인관계기능': { start: /#2\.\s*대인관계/,       end: /#3\.\s*자기관리/ },
  '자기관리기능': { start: /#3\.\s*자기관리/,       end: /#4\.\s*조사/ },
  '조사기능':     { start: /#4\.\s*조사/,           end: /#5\.\s*사고/ },
  '사고기능':     { start: /#5\.\s*사고/,           end: null },
}

// Activity name 패턴으로 정확한 label→URI 매핑
function extractActivityLinks(text: string, uris: string[]): { label: string; url: string }[] {
  const pattern = /Activity name\s*[：:]\s*([^\n(（]+?)(?:\s*[\(（]|\s*\n)/gm
  const results: { label: string; url: string }[] = []
  const seen = new Set<string>()

  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    const label = m[1].trim().replace(/[\(（]$/, '').trim()
    const pos = m.index + m[0].length
    const nearby = text.slice(pos, pos + 300)

    for (const uri of uris) {
      const frag = uri.slice(0, 35)
      if (nearby.includes(frag) && !seen.has(uri)) {
        seen.add(uri)
        results.push({ label, url: uri })
        break
      }
    }
  }
  return results
}
function extractUrisFromBuffer(buffer: Buffer): string[] {
  const raw = buffer.toString('latin1')
  const matches = [...raw.matchAll(/\/URI\s*\(([^)]+)\)/g)]
  const urls = matches
    .map(m => m[1].trim())
    .filter(u => u.startsWith('http'))
  return [...new Set(urls)]
}

// 텍스트에서 특정 ATL 범주 섹션만 추출
function extractSection(text: string, category: string): string {
  const def = ATL_SECTIONS[category]
  if (!def) return ''
  const mStart = text.search(def.start)
  if (mStart === -1) return ''
  const mEnd = def.end ? text.search(def.end) : -1
  return mEnd === -1 ? text.slice(mStart) : text.slice(mStart, mEnd)
}

// GET /api/files/content?name=파일명
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

      let fullText = ''
      try {
        const parsed = await pdfParse(buffer)
        fullText = parsed.text as string
      } catch {
        fullText = ''
      }

      // 섹션별 텍스트 분리
      const sections: Record<string, string> = {}
      for (const cat of Object.keys(ATL_SECTIONS)) {
        sections[cat] = extractSection(fullText, cat)
      }

      // 원시 바이너리에서 완전한 URL 추출
      const uris = extractUrisFromBuffer(buffer)

      // Activity name 패턴으로 정확한 label→URI 매핑
      const extractedLinks = extractActivityLinks(fullText, uris)

      return NextResponse.json({
        name,
        isPdf: true,
        base64,
        mimeType: 'application/pdf',
        content: fullText,
        sections,
        uris,
        extractedLinks, // 정확한 label→URI 매핑 (서버에서 생성)
      })
    } else {
      const text = await data.text()
      return NextResponse.json({ name, isPdf: false, content: text, sections: {}, uris: [] })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
