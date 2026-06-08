'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

type KBFile = {
  name: string
  size: number
  status: 'uploading' | 'ready' | 'error'
  content: string | null
  base64: string | null
  mimeType: string | null
  isPdf: boolean
  extractedLinks: { url: string; label: string }[]
  sections: Record<string, string>   // ATL 범주별 섹션 텍스트
  uris: string[]                     // PDF 어노테이션에서 추출한 완전한 URL
}

// 텍스트에서 URL을 클라이언트에서 직접 추출 — AI 판단에 맡기지 않음
function extractUrls(text: string): { url: string; label: string }[] {
  const urlRegex = /https?:\/\/[^\s\]\[)<>"']+/g
  const found = text.match(urlRegex) || []
  const unique = [...new Set(found)]
  return unique.map(url => {
    const cleaned = url.replace(/[.,)]+$/, '')
    const idx = text.indexOf(url)
    const before = text.slice(Math.max(0, idx - 60), idx).trim()
    const labelMatch = before.match(/([^\n:：·•]+)[:\s]*$/)
    const rawLabel = labelMatch ? labelMatch[1].trim() : ''
    const label = rawLabel.length > 3 && rawLabel.length < 50 ? rawLabel : cleaned
    return { url: cleaned, label }
  })
}

type RecommendationItem = {
  category: string
  skill: string
  relevance: 'high' | 'mid'
  description: string
  reason: string
  activities: string[]
  activityKeys?: string[]  // AI가 고른 활동 label — 클라이언트가 PDF 링크로 매핑
}

type ResultData = {
  summary: string
  usedFiles: string[]
  recommendations: RecommendationItem[]
  gemsExtra?: string   // GEMS 지침이 ATL 구조 밖의 자유 형식 요청일 때 사용
}

const TYPE_TAGS = [
  { label: '프로젝트 기반', val: '프로젝트 기반 학습' },
  { label: '탐구 학습',     val: '탐구 학습' },
  { label: '협동 학습',     val: '협동 학습' },
  { label: '토론·토의',    val: '토론·토의' },
  { label: '발표·PT',      val: '발표 중심' },
  { label: '플립드 러닝',   val: '플립드 러닝' },
  { label: '문제 해결',     val: '문제 해결 중심' },
]

const ATL_TAGS = ['의사소통기능', '대인관계기능', '자기관리기능', '조사기능', '사고기능']

const GEMS_PRESETS = [
  {
    label: '초등(PYP) 교사용',
    val: `[대상] PYP 초등 교사 (IB 전문 지식 없을 수 있음)
[언어] 전문 약어(ATL, MYP, DP 등) 사용 금지. "탐구기능" 대신 "궁금한 걸 스스로 찾아보는 능력"처럼 쉬운 말로 바꿔 쓸 것.
[description] 각 스킬이 교실에서 어떤 모습으로 나타나는지 구체적 장면 묘사 (예: "학생이 모둠 활동 중 친구 의견을 끝까지 듣고 고개를 끄덕이는 모습").
[activities] 특별한 준비물·공간 없이 바로 할 수 있는 15분 이내 활동 3가지.
[reason] "왜 이 수업에 맞나요?"를 학부모에게 설명하듯 1문장으로.
[summary] 수업 전체를 이야기처럼 2문장으로 서술.`,
  },
  {
    label: 'MYP 교사용',
    val: `[대상] IB MYP 교사 (ATL 프레임워크 숙지)
[언어] IB 공식 ATL 용어 그대로 사용. 스킬 클러스터 명칭 병기 가능.
[description] MYP 교과 맥락과 연결하여 해당 스킬이 MYP Unit Planner의 어느 항목(ATL skills, Learning experiences 등)에 해당하는지 명시.
[activities] 수업 설계에 바로 삽입 가능한 학습 경험 기술. 형식: 동사로 시작하는 학습 목표문 스타일 ("학생들은 ~을 통해 ~할 수 있다").
[reason] MYP Key Concept 또는 Related Concept과 연결하여 1문장.
[summary] Unit Planner 'Context' 섹션에 붙여넣을 수 있는 수준의 요약 2문장.`,
  },
  {
    label: '한 줄 요약형',
    val: `[분량 제약] description은 반드시 15단어 이내 1문장. reason은 10단어 이내. activities는 단어 또는 짧은 구(句) 형태 3개.
[summary] 핵심 키워드 3개를 콤마로 나열 후, 1문장 결론.
[형식] 군더더기 없이 핵심만. 접속사, 수식어 최소화.
[목적] 교사가 5초 안에 스캔하여 전체 추천을 파악할 수 있어야 함.`,
  },
  {
    label: '심화 분석형',
    val: `[분량] description 4~5문장. reason 2~3문장. activities 각 1~2문장 설명 포함.
[description] ① 스킬 정의 → ② 이 수업에서의 발현 양상 → ③ 학생이 성장하는 구체적 방식 순서로 서술.
[activities] 각 활동에 예상 소요시간·준비물·수업 단계(도입/전개/정리) 명시.
[reason] 수업 설명의 어떤 요소가 이 스킬 선택의 근거인지 인용하여 설명.
[summary] 이 수업의 ATL 관점 강점과 개선 여지를 각 1문장씩 포함한 2문장 분석.`,
  },
  {
    label: '즉시 실행형',
    val: `[초점] 이론·배경 설명 완전 생략. 모든 내용은 "내일 수업에서 바로 쓸 수 있는가?"를 기준으로 작성.
[description] 교사 행동 지침으로 작성 (예: "수업 시작 3분, 전날 배운 내용을 1분 이내로 요약하게 하세요").
[activities] 각 활동을 교사 시나리오 형식으로: "1) 교사가 ~한다 → 2) 학생이 ~한다 → 3) 결과물은 ~이다".
[reason] 수업 목표와의 연결을 "~하기 때문에 효과적입니다" 형식으로.
[summary] 오늘 수업에서 ATL을 적용하는 3단계 실행 계획으로 작성.`,
  },
  {
    label: '평가 기준 연계',
    val: `[핵심 요구사항] 모든 스킬을 IB 평가 기준(Criteria A~D 또는 관련 교과 기준)과 명시적으로 연결할 것.
[description] 이 스킬이 어떤 평가 기준의 어느 수행 수준(strand)에서 드러나는지 구체적으로 서술.
[activities] 각 활동 옆에 "(Criterion B - 탐구 계획)" 형식으로 연계 기준 태그 부착.
[reason] "이 스킬을 연습하면 Criterion [X]의 [strand] 수행 수준이 향상되는 이유" 형식으로 작성.
[summary] 이 수업의 주요 평가 기준과 ATL 연계 지점을 표 형식 대신 문장으로 요약 (예: "이 수업은 주로 Criterion C와 D에서 평가되며, 의사소통기능과 사고기능이 핵심 연결고리입니다").`,
  },
]

const CAT: Record<string, { iconBg: string; iconFill: string; icon: string }> = {
  '의사소통기능': { iconBg: '#185FA5', iconFill: '#E6F1FB', icon: 'ti-messages' },
  '대인관계기능': { iconBg: '#993C1D', iconFill: '#FAECE7', icon: 'ti-users' },
  '자기관리기능': { iconBg: '#3B6D11', iconFill: '#EAF3DE', icon: 'ti-calendar-check' },
  '조사기능':     { iconBg: '#534AB7', iconFill: '#EEEDFE', icon: 'ti-search' },
  '사고기능':     { iconBg: '#BA7517', iconFill: '#FAEEDA', icon: 'ti-brain' },
}

function fmtSize(b: number) {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}
function fileIconCls(name: string) {
  const e = name.split('.').pop()?.toLowerCase()
  if (e === 'pdf') return 'fi-pdf'
  if (e === 'txt' || e === 'md') return 'fi-txt'
  if (e === 'doc' || e === 'docx') return 'fi-doc'
  if (e === 'csv' || e === 'xlsx') return 'fi-csv'
  return 'fi-other'
}
function fileIconTi(name: string) {
  const e = name.split('.').pop()?.toLowerCase()
  if (e === 'pdf') return 'ti-file-type-pdf'
  if (e === 'txt' || e === 'md') return 'ti-file-text'
  if (e === 'csv') return 'ti-table'
  if (e === 'json') return 'ti-braces'
  if (e === 'doc' || e === 'docx') return 'ti-file-word'
  if (e === 'xlsx') return 'ti-file-spreadsheet'
  return 'ti-file'
}

const STORAGE_KEY = 'atl_gemini_key'

export default function Home() {
  const [modalOpen, setModalOpen]         = useState(false)
  const [apiKey, setApiKey]               = useState('')
  const [apiKeyInput, setApiKeyInput]     = useState('')
  const [gemsText, setGemsText]           = useState('')
  const [gemsPreset, setGemsPreset]       = useState('')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [selectedATLs, setSelectedATLs]   = useState<Set<string>>(new Set())
  const [grade, setGrade]                 = useState('')
  const [lesson, setLesson]               = useState('')
  const [knowledgeBase, setKB]            = useState<KBFile[]>([])
  const [loading, setLoading]             = useState(false)
  const [result, setResult]               = useState<ResultData | null>(null)
  const [error, setError]                 = useState('')
  const [kbLoading, setKbLoading]         = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef      = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || ''
    setApiKey(saved)
    setApiKeyInput(saved)
  }, [])

  const saveApiKey = () => {
    localStorage.setItem(STORAGE_KEY, apiKeyInput)
    setApiKey(apiKeyInput)
    setModalOpen(false)
  }

  const loadStoredFiles = useCallback(async () => {
    setKbLoading(true)
    try {
      const res = await fetch('/api/files')
      if (!res.ok) throw new Error('목록 조회 실패')
      const list: { name: string; metadata?: { size?: number } }[] = await res.json()
      const files = await Promise.all(
        list.map(async (item) => {
          try {
            const cr = await fetch(`/api/files/content?name=${encodeURIComponent(item.name)}`)
            if (!cr.ok) throw new Error('읽기 실패')
            const data = await cr.json()
            const content = data.content ?? null
            return {
              name: item.name, size: item.metadata?.size ?? 0, status: 'ready' as const,
              content, base64: data.base64 ?? null,
              mimeType: data.mimeType ?? null, isPdf: data.isPdf ?? false,
              extractedLinks: content ? extractUrls(content) : [],
              sections: data.sections ?? {},
              uris: data.uris ?? [],
            }
          } catch {
            return { name: item.name, size: item.metadata?.size ?? 0, status: 'error' as const, content: null, base64: null, mimeType: null, isPdf: false, extractedLinks: [], sections: {}, uris: [] }
          }
        })
      )
      setKB(files)
    } catch { setKB([]) }
    finally { setKbLoading(false) }
  }, [])

  useEffect(() => { loadStoredFiles() }, [loadStoredFiles])

  const toggleType = (val: string) =>
    setSelectedTypes(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n })
  const toggleATL = (val: string) =>
    setSelectedATLs(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n })

  const uploadFile = async (file: File) => {
    const entry: KBFile = { name: file.name, size: file.size, status: 'uploading', content: null, base64: null, mimeType: null, isPdf: false, extractedLinks: [], sections: {}, uris: [] }
    setKB(prev => [...prev.filter(f => f.name !== file.name), entry])
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/files', { method: 'POST', body: form })
      if (!res.ok) throw new Error('업로드 실패')
      const cr = await fetch(`/api/files/content?name=${encodeURIComponent(file.name)}`)
      if (!cr.ok) throw new Error('읽기 실패')
      const data = await cr.json()
      setKB(prev => prev.map(f => f.name === file.name
        ? { ...f, status: 'ready', content: data.content ?? null, base64: data.base64 ?? null, mimeType: data.mimeType ?? null, isPdf: data.isPdf ?? false, extractedLinks: data.content ? extractUrls(data.content) : [], sections: data.sections ?? {}, uris: data.uris ?? [] }
        : f))
    } catch {
      setKB(prev => prev.map(f => f.name === file.name ? { ...f, status: 'error', extractedLinks: [] } : f))
    }
  }

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    ;[...(e.target.files || [])].forEach(uploadFile); e.target.value = ''
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); dropRef.current?.classList.remove('drag-over')
    ;[...e.dataTransfer.files].forEach(uploadFile)
  }
  const deleteFile = async (name: string) => {
    setKB(prev => prev.filter(f => f.name !== name))
    await fetch('/api/files', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  }
  const deleteAll = async () => {
    const names = knowledgeBase.map(f => f.name); setKB([])
    await Promise.all(names.map(name => fetch('/api/files', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })))
  }

  const buildPrompt = () => {
    const readyFiles = knowledgeBase.filter(f => f.status === 'ready')
    const typeStr = selectedTypes.size > 0 ? [...selectedTypes].join(', ') : '명시되지 않음'
    const atlStr  = selectedATLs.size  > 0 ? [...selectedATLs].join(', ')  : '전체 범주'
    const fileStr = readyFiles.map(f => f.name).join(', ') || '없음'

    let fileDocs = ''
    readyFiles.forEach(f => {
      if (f.isPdf && Object.keys(f.sections).length > 0) {
        // 선택한 ATL 범주에 해당하는 섹션만 전송
        const targetCats = selectedATLs.size > 0 ? [...selectedATLs] : Object.keys(f.sections)
        const sectionTexts = targetCats
          .map(cat => f.sections[cat] ? `[${cat}]\n${f.sections[cat]}` : '')
          .filter(Boolean)
          .join('\n\n')
        if (sectionTexts) {
          fileDocs += `\n=== 참고 문서: ${f.name} (선택 범주 섹션) ===\n${sectionTexts}\n=== 끝 ===\n`
        }
      } else if (f.content) {
        fileDocs += `\n=== 참고 문서: ${f.name} ===\n${f.content.slice(0, 5000)}\n=== 끝 ===\n`
      }
    })

    // uris(완전한 URL) 기반으로 activityList 구성
    // label은 텍스트에서 URL 앞 텍스트로 추정, URL은 완전한 값 사용
    const allUris = readyFiles.flatMap(f => f.uris)
    const allLinks = readyFiles.flatMap(f => f.extractedLinks)
    // uris가 있으면 uris 우선, 없으면 extractedLinks fallback
    const linkSource = allUris.length > 0
      ? allUris.map(url => {
          const matched = allLinks.find(lk => url.includes(lk.url.slice(0, 40)) || lk.url.includes(url.slice(0, 40)))
          return { label: matched?.label || url, url }
        })
      : allLinks
    const activityList = linkSource.length > 0
      ? `\n[참고 문서의 활동 목록 — activityKeys는 반드시 이 label 값 중에서만 선택]\n` +
        linkSource.map((lk, i) => `${i + 1}. "${lk.label}"`).join('\n') + '\n'
      : ''

    const gemsBlock = gemsText.trim()
      ? `
########################################
## GEMS 답변 지침 (최우선 적용 — 이하 모든 출력에 강제 적용)
########################################
아래 지침은 JSON의 각 필드 작성 방식을 직접 제어합니다.
지침에 명시된 [분량], [언어], [형식], [description], [activities], [reason], [summary] 규칙을
recommendations 배열의 모든 항목과 summary 필드에 빠짐없이 적용하세요.

★ 지침이 ATL 형식 밖의 자유 요청을 포함하면 "gemsExtra" 필드에 마크다운으로 작성하세요.

지침을 따르지 않은 항목은 잘못된 응답으로 간주합니다.

${gemsText.trim()}

########################################
## GEMS 지침 끝
########################################
`
      : ''

    return `${gemsBlock}
당신은 IB(국제바칼로레아) 교육 전문가입니다. 아래 수업에 맞는 ATL 스킬을 추천하세요.
${fileDocs}
[수업 정보]
- 수업 설명: ${lesson || '(없음)'}
- 수업 유형: ${typeStr}
- 학년군: ${grade || '명시되지 않음'}
- 집중 ATL 범주: ${atlStr}
- 참고 문서: ${fileStr}

[ATL 5대 기능 범주]
1. 의사소통기능: 읽기·쓰기·듣기·말하기, 다양한 매체 활용, 디지털 소통
2. 대인관계기능: 협업, 팀워크, 갈등 관리, 리더십, 경청·공감
3. 자기관리기능: 조직화, 시간 관리, 정서 조절, 메타인지, 자기동기
4. 조사기능: 정보 수집·평가, 미디어 리터러시, 데이터 정리, 출처 분석
5. 사고기능: 비판적 사고, 창의적 사고, 전이, 문제 해결·의사결정
${activityList}
반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만:
{
  "summary": "수업 분석 요약${gemsText.trim() ? ' (GEMS [summary] 규칙 적용)' : ' (2–3문장)'}",
  "usedFiles": ["참고한 파일명"],
  "gemsExtra": "",
  "recommendations": [
    {
      "category": "ATL 기능 범주명",
      "skill": "ATL 스킬명",
      "relevance": "high 또는 mid",
      "description": "스킬 설명${gemsText.trim() ? ' (GEMS [description] 규칙 적용)' : ' 1–2문장'}",
      "reason": "이유${gemsText.trim() ? ' (GEMS [reason] 규칙 적용)' : ' 1문장'}",
      "activities": ["활동1", "활동2", "활동3"],
      "activityKeys": ["위 활동 목록의 label — 링크 연결용, 목록에 없는 값 절대 금지"]
    }
  ]
}
recommendations 최소 4개, 최대 7개.${activityList ? '\nactivityKeys는 위 [참고 문서의 활동 목록] label과 정확히 일치해야 합니다.' : '\nactivityKeys는 빈 배열 []로 두세요.'}${gemsText.trim() ? '\n위 GEMS 지침의 분량·형식 규칙이 최소/최대 개수보다 우선합니다.' : ''}`
  }

  const handleSubmit = async () => {
    if (!apiKey) { setModalOpen(true); return }
    if (!lesson && selectedTypes.size === 0 && knowledgeBase.length === 0) {
      alert('수업 설명이나 수업 유형을 입력해 주세요.'); return
    }
    if (knowledgeBase.some(f => f.status === 'uploading')) {
      alert('파일 업로드 중입니다. 잠시 후 다시 시도해 주세요.'); return
    }
    setLoading(true); setResult(null); setError('')
    try {
      // Gemini API 직접 호출 (OpenAI 호환 엔드포인트)
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: [
                '당신은 IB 교육 전문가입니다.',
                '반드시 순수 JSON만 응답하세요. 마크다운 코드블록 없이 JSON 객체만 반환하세요.',
                gemsText.trim()
                  ? '사용자 메시지 최상단의 [GEMS 답변 지침]은 최우선 지시사항입니다. JSON의 모든 텍스트 필드(summary, description, reason, activities)를 해당 지침에 명시된 언어 수준·분량·형식에 맞게 작성하세요. 지침과 충돌할 경우 기본 형식보다 GEMS 지침을 따르세요.'
                  : '',
              ].filter(Boolean).join(' '),
            },
            { role: 'user', content: buildPrompt() },
          ],
          temperature: 0.35,
          max_tokens: 4000,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`)

      const raw: string = data?.choices?.[0]?.message?.content || ''
      if (!raw) throw new Error(`AI 응답이 비어있습니다. 모델: ${data?.model || 'unknown'}`)

      // JSON 블록 추출 — 코드블록, 앞뒤 텍스트 제거
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error(`JSON을 찾을 수 없습니다. 응답: ${raw.slice(0, 200)}`)

      const parsed = JSON.parse(jsonMatch[0])

      // Supabase에 기록 저장
      await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson, grade,
          selectedTypes: [...selectedTypes],
          selectedATLs: [...selectedATLs],
          gemsInstruction: gemsText.trim() || null,
          parsed,
        }),
      })

      setResult(parsed)
    } catch (e: any) {
      setError(e.message || '알 수 없는 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const kbCount = knowledgeBase.filter(f => f.status === 'ready').length
  const kbTotal = knowledgeBase.reduce((s, f) => s + f.size, 0)
  const apiOk = apiKey.length > 10

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div className="logo"><i className="ti ti-school"></i></div>
          <span className="brand">ATL 추천 에이전시</span>
        </div>
        <button className="btn-icon" onClick={() => setModalOpen(true)} title="설정">
          <i className="ti ti-settings"></i>
          <span className={`api-indicator${apiOk ? ' ok' : ''}${gemsText.trim() ? ' gems-on' : ''}`}></span>
        </button>
      </div>

      {modalOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal-box">
            <div className="modal-title"><i className="ti ti-settings"></i> 설정</div>

            <div className="modal-label">Gemini API 키</div>
            <input
              type="password" className="modal-input" placeholder="gsk_..."
              value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
              autoComplete="off"
            />
            <div className="modal-hint">
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
                style={{ color: 'var(--green-dark)' }}>aistudio.google.com</a>에서 무료로 발급받으세요.<br />
              키는 브라우저에만 저장되며 외부로 전송되지 않습니다.
            </div>
            <div className="modal-status">
              <span className={`modal-dot${apiKeyInput.length > 10 ? ' ok' : ''}`}></span>
              <span className={`modal-dot-label${apiKeyInput.length > 10 ? ' ok' : ''}`}>
                {apiKeyInput.length > 10 ? 'API 키가 입력되었습니다' : 'API 키가 입력되지 않았습니다'}
              </span>
            </div>

            <div style={{ borderTop: '0.5px solid var(--border)', margin: '1rem 0' }}></div>

            <div className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span>답변 방향성</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', background: 'var(--green)', color: '#fff', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>GEMS</span>
              {gemsText.trim() && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--green-dark)', marginLeft: 'auto' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }}></span>적용 중
                </span>
              )}
            </div>
            <div className="gems-presets">
              {GEMS_PRESETS.map(p => (
                <button key={p.val} className={`gems-preset${gemsPreset === p.val ? ' active' : ''}`}
                  onClick={() => { if (gemsPreset === p.val) { setGemsPreset(''); setGemsText('') } else { setGemsPreset(p.val); setGemsText(p.val) } }}>
                  {p.label}
                </button>
              ))}
            </div>
            <textarea className="gems-textarea" value={gemsText}
              placeholder="예시 1 (언어 수준): 초등 1-2학년 대상 수업입니다. 전문 용어 없이 쉬운 말로, description은 교실 장면 묘사로 써주세요.&#10;예시 2 (분량): description 1문장, activities는 이름만 3개, reason 없이 작성해주세요.&#10;예시 3 (형식): 모든 activities를 '~을 통해 ~한다' 형식으로, reason은 MYP Criterion과 연결해주세요."
              maxLength={400} onChange={e => { setGemsText(e.target.value); setGemsPreset('') }}
              style={{ marginTop: 8 }} />
            <div className="gems-char">{gemsText.length} / 400</div>
            <div className="modal-hint" style={{ marginTop: 6 }}>각 필드(description · activities · reason · summary)의 언어 수준, 분량, 형식을 직접 지정하세요. 구체적일수록 AI가 정확히 따릅니다.</div>

            <div className="modal-close-row">
              <button className="btn-pill" style={{ height: 34, fontSize: '12.5px' }} onClick={saveApiKey}>
                <i className="ti ti-check"></i> 저장
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="main">
        <div className="kb-panel">
          <div className="panel-head">
            <div className="panel-label">지식 베이스</div>
            <div ref={dropRef} className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add('drag-over') }}
              onDragLeave={() => dropRef.current?.classList.remove('drag-over')}
              onDrop={onDrop}>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.md,.docx,.csv,.json,.xlsx" onChange={onFileSelect} style={{ display: 'none' }} />
              <i className="ti ti-cloud-upload"></i>
              <p>클릭하거나 드래그하여<br />파일 업로드</p>
              <div className="sup-fmt">PDF · TXT · MD · CSV · JSON</div>
            </div>
          </div>
          <div className="kb-list">
            {kbLoading ? (
              <div className="kb-empty">
                <div className="loading-dots" style={{ justifyContent: 'center', marginTop: 24 }}><span></span><span></span><span></span></div>
                <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>파일 불러오는 중...</p>
              </div>
            ) : knowledgeBase.length === 0 ? (
              <div className="kb-empty">
                <i className="ti ti-files"></i>
                <p>파일을 업로드하면<br />AI가 내용을 읽고<br />ATL 추천에 활용합니다</p>
              </div>
            ) : knowledgeBase.map((f, i) => (
              <div key={i} className={`file-item${f.status === 'error' ? ' error' : ''}`}>
                <div className={`file-icon ${fileIconCls(f.name)}`}><i className={`ti ${fileIconTi(f.name)}`}></i></div>
                <div className="file-info">
                  <div className="file-name" title={f.name}>{f.name}</div>
                  <div className="file-meta">{fmtSize(f.size)}</div>
                  <div className={`file-status ${f.status === 'uploading' ? 'proc' : f.status}`}>
                    {f.status === 'ready' ? '✓ 준비 완료' : f.status === 'error' ? '⚠ 오류' : '⬆ 업로드 중...'}
                  </div>
                </div>
                <button className="file-del" onClick={() => deleteFile(f.name)}><i className="ti ti-x"></i></button>
              </div>
            ))}
          </div>
          <div className="kb-foot">
            <span className="kb-count">파일 {knowledgeBase.length}개 · {fmtSize(kbTotal)}</span>
            <button className="btn-pill-danger" onClick={deleteAll}><i className="ti ti-trash"></i> 전체 삭제</button>
          </div>
        </div>

        <div className="input-panel">
          <div className="input-group">
            <div className="sec-label">수업 설명</div>
            <textarea style={{ minHeight: 180 }}
              placeholder="예: 학생들이 모둠을 이뤄 지역 환경 문제를 조사하고, 발표 자료를 만들어 학교 커뮤니티에 제안하는 프로젝트 수업입니다."
              value={lesson} onChange={e => setLesson(e.target.value)} />
          </div>
          <div className="input-group">
            <div className="sec-label">수업 유형</div>
            <div className="tag-group">
              {TYPE_TAGS.map(t => (
                <span key={t.val} className={`tag${selectedTypes.has(t.val) ? ' active' : ''}`} onClick={() => toggleType(t.val)}>{t.label}</span>
              ))}
            </div>
          </div>
          <div className="input-group">
            <div className="sec-label">학년군</div>
            <select value={grade} onChange={e => setGrade(e.target.value)}>
              <option value="">선택 안함</option>
              <option value="PYP (초등)">PYP (초등)</option>
              <option value="MYP 1–2 (중1–2)">MYP 1–2 (중1–2)</option>
              <option value="MYP 3–4 (중3–고1)">MYP 3–4 (중3–고1)</option>
              <option value="MYP 5 (고2)">MYP 5 (고2)</option>
              <option value="DP 1 (고2)">DP 1 (고2)</option>
              <option value="DP 2 (고3)">DP 2 (고3)</option>
            </select>
          </div>
          <div className="input-group">
            <div className="sec-label">ATL 기능 범주 <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>(선택)</span></div>
            <div className="tag-group">
              {ATL_TAGS.map(t => (
                <span key={t} className={`tag${selectedATLs.has(t) ? ' active' : ''}`} onClick={() => toggleATL(t)}>{t}</span>
              ))}
            </div>
          </div>
          <button className="btn-submit" onClick={handleSubmit} disabled={loading}>
            <i className="ti ti-sparkles"></i>
            {loading ? 'ATL 분석 중...' : 'ATL 추천 받기'}
          </button>
        </div>

        <div className="results-panel">
          {!loading && !result && !error && (
            <div className="empty-state">
              <i className="ti ti-bulb"></i>
              <h3>ATL 추천을 시작하세요</h3>
              <p>⚙️ 설정에서 Gemini API 키와 답변 방향성을 설정하고,<br />수업 내용을 작성하세요</p>
            </div>
          )}
          {loading && (
            <div className="loading-wrap">
              <div className="loading-dots"><span></span><span></span><span></span></div>
              <div className="loading-label">{kbCount > 0 ? `문서 ${kbCount}개를 분석하는 중...` : 'ATL 스킬을 분석하는 중...'}</div>
            </div>
          )}
          {error && (
            <div className="error-box">
              <strong>오류가 발생했습니다</strong>{error}
            </div>
          )}
          {result && (
            <>
              {result.usedFiles?.length > 0 && (
                <div className="kb-used">
                  <span className="kb-used-label">참고 문서</span>
                  {result.usedFiles.map(f => <span key={f} className="kb-chip"><i className="ti ti-file"></i>{f}</span>)}
                </div>
              )}
              {result.summary && (
                <div className="ai-summary">
                  <div className="summary-label">
                    <i className="ti ti-sparkles" style={{ fontSize: 11 }}></i> AI 분석
                    {gemsText.trim() && <span style={{ marginLeft: 'auto', fontSize: 9.5, background: 'var(--green)', color: '#fff', padding: '1px 7px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.05em' }}>GEMS 적용</span>}
                  </div>
                  <div className="summary-text">{result.summary}</div>
                  {gemsText.trim() && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                      <i className="ti ti-adjustments-horizontal" style={{ fontSize: 11, marginRight: 3 }}></i><em>{gemsText}</em>
                    </div>
                  )}
                </div>
              )}
              {result.gemsExtra?.trim() && (
                <div className="ai-summary" style={{ marginBottom: '0.875rem', borderLeft: '2.5px solid var(--green)' }}>
                  <div className="summary-label" style={{ marginBottom: 6 }}>
                    <i className="ti ti-layout-list" style={{ fontSize: 11 }}></i> GEMS 추가 결과
                  </div>
                  <div className="summary-text" style={{ whiteSpace: 'pre-wrap' }}>{result.gemsExtra}</div>
                </div>
              )}
              <div className="results-header">
                <span className="results-title">추천 ATL 스킬</span>
                <span className="results-count">{result.recommendations?.length}개 추천</span>
              </div>
              {result.recommendations?.map((r, idx) => {
                const s = CAT[r.category] || { iconBg: '#5F5E5A', iconFill: '#F1EFE8', icon: 'ti-star' }
                // uris(완전한 URL) 우선, fallback은 extractedLinks
                const allUrisCard = knowledgeBase.filter(f => f.status === 'ready').flatMap(f => f.uris)
                const allLinksCard = knowledgeBase.filter(f => f.status === 'ready').flatMap(f => f.extractedLinks)
                const labelToLink = new Map(
                  allLinksCard.map(lk => {
                    const fullUri = allUrisCard.find(u =>
                      u.includes(lk.url.slice(0, 40)) || lk.url.includes(u.slice(0, 40))
                    )
                    return [lk.label, fullUri || lk.url]
                  })
                )
                const safeLinks = (r.activityKeys || [])
                  .map(key => ({ label: key, url: labelToLink.get(key) }))
                  .filter((lk): lk is { label: string; url: string } => !!lk.url)
                return (
                  <div key={idx} className="atl-card">
                    <div className="atl-card-top">
                      <div className="atl-left">
                        <div className="atl-icon" style={{ background: s.iconFill }}>
                          <i className={`ti ${s.icon}`} style={{ color: s.iconBg, fontSize: 15 }}></i>
                        </div>
                        <div>
                          <div className="atl-name">{r.skill}</div>
                          <div className="atl-cat">{r.category}</div>
                        </div>
                      </div>
                      <span className={`rel-badge ${r.relevance === 'high' ? 'rel-high' : 'rel-mid'}`}>
                        {r.relevance === 'high' ? '적합도 높음' : '적합도 보통'}
                      </span>
                    </div>
                    <p className="atl-desc">{r.description}</p>
                    {r.reason && <div className="atl-reason"><i className="ti ti-arrow-right"></i>{r.reason}</div>}
                    <div className="chips">{r.activities?.map((a, ai) => <span key={ai} className="chip">{a}</span>)}</div>
                    {safeLinks.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {safeLinks.map((lk, li) => (
                          <a key={li} href={lk.url} target="_blank" rel="noreferrer"
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 6,
                              textDecoration: 'none', padding: '5px 8px',
                              borderRadius: 'var(--radius-md)',
                              border: '0.5px solid #AECBFA',
                              background: '#EEF4FF',
                              transition: 'background 0.12s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#D8E9FF')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#EEF4FF')}
                          >
                            <i className="ti ti-external-link" style={{ fontSize: 12, color: '#1A56DB', flexShrink: 0, marginTop: 1 }}></i>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: '#1A56DB', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {lk.label || new URL(lk.url).hostname}
                              </div>
                              <div style={{ fontSize: 10.5, color: '#5580C7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                                {lk.url}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </>
  )
}
