'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

/* ── 타입 ── */
type KBFile = {
  name: string
  size: number
  status: 'uploading' | 'ready' | 'error'
  content: string | null
  base64: string | null
  mimeType: string | null
  isPdf: boolean
}

type RecommendationItem = {
  category: string
  skill: string
  relevance: 'high' | 'mid'
  description: string
  reason: string
  activities: string[]
}

type ResultData = {
  summary: string
  usedFiles: string[]
  recommendations: RecommendationItem[]
}

/* ── 상수 ── */
const TYPE_TAGS = [
  { label: '프로젝트 기반', val: '프로젝트 기반 학습' },
  { label: '탐구 학습',     val: '탐구 학습' },
  { label: '협동 학습',     val: '협동 학습' },
  { label: '토론·토의',    val: '토론·토의' },
  { label: '발표·PT',      val: '발표 중심' },
  { label: '플립드 러닝',   val: '플립드 러닝' },
  { label: '문제 해결',     val: '문제 해결 중심' },
]

const ATL_TAGS = [
  '의사소통기능', '대인관계기능', '자기관리기능', '조사기능', '사고기능',
]

const GEMS_PRESETS = [
  { label: '초등 교사용',  val: '초등교사용: 쉽고 직관적인 언어로, 활동 위주로 설명해줘' },
  { label: '중등 교사용',  val: '중등교사용: ATL 용어를 정확히 사용하고, IB MYP 맥락에 맞게 설명해줘' },
  { label: '간결하게',     val: '간결하게: 각 스킬을 1-2문장으로 요약하고, 활동 예시는 핵심 1개만 제시해줘' },
  { label: '상세하게',     val: '상세하게: 각 스킬별로 배경 이론, 실제 적용 방법, 평가 연계까지 풍부하게 설명해줘' },
  { label: '실용 중심',    val: '실용 중심: 이론 설명 최소화, 수업에서 바로 쓸 수 있는 구체적 활동과 도구 위주로 제안해줘' },
  { label: '평가 연계',    val: '평가 연계: 각 ATL 스킬이 IB 평가 기준(Criteria)과 어떻게 연결되는지 명시해줘' },
]

const CAT: Record<string, { iconBg: string; iconFill: string; icon: string }> = {
  '의사소통기능': { iconBg: '#185FA5', iconFill: '#E6F1FB', icon: 'ti-messages' },
  '대인관계기능': { iconBg: '#993C1D', iconFill: '#FAECE7', icon: 'ti-users' },
  '자기관리기능': { iconBg: '#3B6D11', iconFill: '#EAF3DE', icon: 'ti-calendar-check' },
  '조사기능':     { iconBg: '#534AB7', iconFill: '#EEEDFE', icon: 'ti-search' },
  '사고기능':     { iconBg: '#BA7517', iconFill: '#FAEEDA', icon: 'ti-brain' },
}

/* ── 유틸 ── */
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

/* ── 컴포넌트 ── */
export default function Home() {
  const [modalOpen, setModalOpen]           = useState(false)
  const [gemsText, setGemsText]             = useState('')
  const [gemsPreset, setGemsPreset]         = useState('')
  const [selectedTypes, setSelectedTypes]   = useState<Set<string>>(new Set())
  const [selectedATLs, setSelectedATLs]     = useState<Set<string>>(new Set())
  const [grade, setGrade]                   = useState('')
  const [lesson, setLesson]                 = useState('')
  const [knowledgeBase, setKB]              = useState<KBFile[]>([])
  const [loading, setLoading]               = useState(false)
  const [result, setResult]                 = useState<ResultData | null>(null)
  const [error, setError]                   = useState('')
  const [kbLoading, setKbLoading]           = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef      = useRef<HTMLDivElement>(null)

  /* ── 마운트 시 Storage에서 파일 목록 불러오기 ── */
  const loadStoredFiles = useCallback(async () => {
    setKbLoading(true)
    try {
      const res = await fetch('/api/files')
      if (!res.ok) throw new Error('목록 조회 실패')
      const list: { name: string; metadata?: { size?: number } }[] = await res.json()

      // 각 파일의 내용도 병렬로 불러오기
      const files = await Promise.all(
        list.map(async (item) => {
          try {
            const cr = await fetch(`/api/files/content?name=${encodeURIComponent(item.name)}`)
            if (!cr.ok) throw new Error('읽기 실패')
            const data = await cr.json()
            return {
              name: item.name,
              size: item.metadata?.size ?? 0,
              status: 'ready' as const,
              content: data.content ?? null,
              base64: data.base64 ?? null,
              mimeType: data.mimeType ?? null,
              isPdf: data.isPdf ?? false,
            }
          } catch {
            return {
              name: item.name,
              size: item.metadata?.size ?? 0,
              status: 'error' as const,
              content: null, base64: null, mimeType: null, isPdf: false,
            }
          }
        })
      )
      setKB(files)
    } catch {
      // 네트워크 오류 등 — 빈 목록으로 시작
      setKB([])
    } finally {
      setKbLoading(false)
    }
  }, [])

  useEffect(() => { loadStoredFiles() }, [loadStoredFiles])

  /* ── 태그 토글 ── */
  const toggleType = (val: string) =>
    setSelectedTypes(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n })
  const toggleATL = (val: string) =>
    setSelectedATLs(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n })

  /* ── 파일 업로드 → Supabase Storage ── */
  const uploadFile = async (file: File) => {
    const entry: KBFile = {
      name: file.name, size: file.size, status: 'uploading',
      content: null, base64: null, mimeType: null, isPdf: false,
    }
    setKB(prev => {
      // 같은 이름이면 교체
      const filtered = prev.filter(f => f.name !== file.name)
      return [...filtered, entry]
    })

    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/files', { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error || '업로드 실패')

      // 업로드 후 내용 읽기
      const cr = await fetch(`/api/files/content?name=${encodeURIComponent(file.name)}`)
      if (!cr.ok) throw new Error('읽기 실패')
      const data = await cr.json()

      setKB(prev => prev.map(f =>
        f.name === file.name
          ? { ...f, status: 'ready', content: data.content ?? null, base64: data.base64 ?? null, mimeType: data.mimeType ?? null, isPdf: data.isPdf ?? false }
          : f
      ))
    } catch (e: any) {
      setKB(prev => prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f))
    }
  }

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    ;[...(e.target.files || [])].forEach(uploadFile)
    e.target.value = ''
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dropRef.current?.classList.remove('drag-over')
    ;[...e.dataTransfer.files].forEach(uploadFile)
  }

  /* ── 파일 삭제 ── */
  const deleteFile = async (name: string) => {
    setKB(prev => prev.filter(f => f.name !== name))
    await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }

  const deleteAll = async () => {
    const names = knowledgeBase.map(f => f.name)
    setKB([])
    await Promise.all(names.map(name =>
      fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
    ))
  }

  /* ── 프롬프트 빌드 ── */
  const buildParts = () => {
    const parts: object[] = []
    const readyFiles = knowledgeBase.filter(f => f.status === 'ready')
    readyFiles.forEach(f => {
      if (f.isPdf && f.base64) {
        parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } })
        parts.push({ text: `위 파일은 "${f.name}"입니다. ATL 추천 시 이 문서의 내용을 적극 반영하세요.` })
      } else if (f.content) {
        parts.push({ text: `=== 참고 문서: ${f.name} ===\n${f.content.slice(0, 10000)}\n=== 끝 ===` })
      }
    })
    const typeStr = selectedTypes.size > 0 ? [...selectedTypes].join(', ') : '명시되지 않음'
    const atlStr  = selectedATLs.size  > 0 ? [...selectedATLs].join(', ')  : '전체 범주'
    const fileStr = readyFiles.map(f => f.name).join(', ') || '없음'
    const gemsBlock = gemsText.trim()
      ? `\n[답변 방향성 지침 — 반드시 준수]\n${gemsText.trim()}\n`
      : ''
    parts.push({ text: `
당신은 IB(국제바칼로레아) 교육 전문가입니다. 위에 제공된 참고 문서를 바탕으로 수업에 맞는 ATL 스킬을 추천해 주세요.
${gemsBlock}
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

반드시 아래 JSON 형식으로만 응답하세요. 마크다운 없이 순수 JSON만:
{
  "summary": "수업 분석 요약 (2–3문장)",
  "usedFiles": ["참고한 파일명"],
  "recommendations": [
    { "category": "ATL 기능 범주명", "skill": "ATL 스킬명", "relevance": "high 또는 mid",
      "description": "스킬 설명 1–2문장", "reason": "이유 1문장",
      "activities": ["활동1", "활동2", "활동3"] }
  ]
}
recommendations 최소 4개, 최대 7개.` })
    return parts
  }

  /* ── 제출 ── */
  const handleSubmit = async () => {
    if (!lesson && selectedTypes.size === 0 && knowledgeBase.length === 0) {
      alert('수업 설명이나 수업 유형을 입력해 주세요.'); return
    }
    if (knowledgeBase.some(f => f.status === 'uploading')) {
      alert('파일 업로드 중입니다. 잠시 후 다시 시도해 주세요.'); return
    }
    setLoading(true); setResult(null); setError('')
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson, grade,
          selectedTypes: [...selectedTypes],
          selectedATLs:  [...selectedATLs],
          gemsInstruction: gemsText.trim() || null,
          parts: buildParts(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setResult(data)
    } catch (e: any) {
      setError(e.message || '알 수 없는 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const kbCount = knowledgeBase.filter(f => f.status === 'ready').length
  const kbTotal = knowledgeBase.reduce((s, f) => s + f.size, 0)

  return (
    <>
      {/* TOP BAR */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="logo"><i className="ti ti-school"></i></div>
          <span className="brand">ATL 추천 에이전시</span>
        </div>
        <button className="btn-icon" onClick={() => setModalOpen(true)} title="설정">
          <i className="ti ti-settings"></i>
          <span className={`api-indicator ok${gemsText.trim() ? ' gems-on' : ''}`}></span>
        </button>
      </div>

      {/* SETTINGS MODAL */}
      {modalOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal-box">
            <div className="modal-title"><i className="ti ti-settings"></i> 설정</div>
            <div className="modal-label">Gemini API 키</div>
            <div className="modal-hint" style={{ marginBottom: 8 }}>
              API 키는 서버 환경변수(<code>GEMINI_API_KEY</code>)로 관리됩니다.<br />
              Vercel 대시보드 → Settings → Environment Variables에서 설정하세요.
            </div>
            <div className="modal-status">
              <span className="modal-dot ok"></span>
              <span className="modal-dot-label ok">서버에서 API 키를 사용합니다</span>
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
                  onClick={() => {
                    if (gemsPreset === p.val) { setGemsPreset(''); setGemsText('') }
                    else { setGemsPreset(p.val); setGemsText(p.val) }
                  }}>{p.label}</button>
              ))}
            </div>
            <textarea className="gems-textarea" value={gemsText}
              placeholder="예: 초등 저학년 교사 대상이므로 전문 용어 대신 쉬운 말로, 실내 활동 위주로 제안해주세요."
              maxLength={400} onChange={e => { setGemsText(e.target.value); setGemsPreset('') }}
              style={{ marginTop: 8 }} />
            <div className="gems-char">{gemsText.length} / 400</div>
            <div className="modal-hint" style={{ marginTop: 6 }}>AI가 추천 결과를 생성할 때 이 지침을 우선적으로 따릅니다.</div>
            <div className="modal-close-row">
              <button className="btn-pill" style={{ height: 34, fontSize: '12.5px' }} onClick={() => setModalOpen(false)}>
                <i className="ti ti-check"></i> 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN */}
      <div className="main">

        {/* 지식 베이스 패널 */}
        <div className="kb-panel">
          <div className="panel-head">
            <div className="panel-label">지식 베이스</div>
            <div ref={dropRef} className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add('drag-over') }}
              onDragLeave={() => dropRef.current?.classList.remove('drag-over')}
              onDrop={onDrop}>
              <input ref={fileInputRef} type="file" multiple
                accept=".pdf,.txt,.md,.docx,.csv,.json,.xlsx"
                onChange={onFileSelect} style={{ display: 'none' }} />
              <i className="ti ti-cloud-upload"></i>
              <p>클릭하거나 드래그하여<br />파일 업로드</p>
              <div className="sup-fmt">PDF · TXT · MD · CSV · JSON</div>
            </div>
          </div>
          <div className="kb-list">
            {kbLoading ? (
              <div className="kb-empty">
                <div className="loading-dots" style={{ justifyContent: 'center', marginTop: 24 }}>
                  <span></span><span></span><span></span>
                </div>
                <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>파일 불러오는 중...</p>
              </div>
            ) : knowledgeBase.length === 0 ? (
              <div className="kb-empty">
                <i className="ti ti-files"></i>
                <p>파일을 업로드하면<br />Gemini가 내용을 읽고<br />ATL 추천에 활용합니다</p>
              </div>
            ) : knowledgeBase.map((f, i) => (
              <div key={i} className={`file-item${f.status === 'error' ? ' error' : ''}`}>
                <div className={`file-icon ${fileIconCls(f.name)}`}><i className={`ti ${fileIconTi(f.name)}`}></i></div>
                <div className="file-info">
                  <div className="file-name" title={f.name}>{f.name}</div>
                  <div className="file-meta">{fmtSize(f.size)}</div>
                  <div className={`file-status ${f.status === 'uploading' ? 'proc' : f.status}`}>
                    {f.status === 'ready' ? '✓ 준비 완료'
                      : f.status === 'error' ? '⚠ 오류'
                      : '⬆ 업로드 중...'}
                  </div>
                </div>
                <button className="file-del" onClick={() => deleteFile(f.name)}>
                  <i className="ti ti-x"></i>
                </button>
              </div>
            ))}
          </div>
          <div className="kb-foot">
            <span className="kb-count">파일 {knowledgeBase.length}개 · {fmtSize(kbTotal)}</span>
            <button className="btn-pill-danger" onClick={deleteAll}>
              <i className="ti ti-trash"></i> 전체 삭제
            </button>
          </div>
        </div>

        {/* 수업 입력 패널 */}
        <div className="input-panel">
          <div className="input-group">
            <div className="sec-label">수업 설명</div>
            <textarea id="lesson-input" style={{ minHeight: 180 }}
              placeholder="예: 학생들이 모둠을 이뤄 지역 환경 문제를 조사하고, 발표 자료를 만들어 학교 커뮤니티에 제안하는 프로젝트 수업입니다."
              value={lesson} onChange={e => setLesson(e.target.value)} />
          </div>
          <div className="input-group">
            <div className="sec-label">수업 유형</div>
            <div className="tag-group">
              {TYPE_TAGS.map(t => (
                <span key={t.val} className={`tag${selectedTypes.has(t.val) ? ' active' : ''}`}
                  onClick={() => toggleType(t.val)}>{t.label}</span>
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
                <span key={t} className={`tag${selectedATLs.has(t) ? ' active' : ''}`}
                  onClick={() => toggleATL(t)}>{t}</span>
              ))}
            </div>
          </div>
          <button className="btn-submit" onClick={handleSubmit} disabled={loading}>
            <i className="ti ti-sparkles"></i>
            {loading ? 'ATL 분석 중...' : 'ATL 추천 받기'}
          </button>
        </div>

        {/* 결과 패널 */}
        <div className="results-panel">
          {!loading && !result && !error && (
            <div className="empty-state">
              <i className="ti ti-bulb"></i>
              <h3>ATL 추천을 시작하세요</h3>
              <p>⚙️ 설정에서 답변 방향성을 설정하고,<br />수업 내용을 작성하세요</p>
            </div>
          )}
          {loading && (
            <div className="loading-wrap">
              <div className="loading-dots"><span></span><span></span><span></span></div>
              <div className="loading-label">
                {kbCount > 0 ? `문서 ${kbCount}개를 분석하는 중...` : 'ATL 스킬을 분석하는 중...'}
              </div>
            </div>
          )}
          {error && (
            <div className="error-box">
              <strong>오류가 발생했습니다</strong>
              {error}
            </div>
          )}
          {result && (
            <>
              {result.usedFiles?.length > 0 && (
                <div className="kb-used">
                  <span className="kb-used-label">참고 문서</span>
                  {result.usedFiles.map(f => (
                    <span key={f} className="kb-chip"><i className="ti ti-file"></i>{f}</span>
                  ))}
                </div>
              )}
              {result.summary && (
                <div className="ai-summary">
                  <div className="summary-label">
                    <i className="ti ti-sparkles" style={{ fontSize: 11 }}></i> Gemini 분석
                    {gemsText.trim() && (
                      <span style={{ marginLeft: 'auto', fontSize: 9.5, background: 'var(--green)', color: '#fff', padding: '1px 7px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.05em' }}>GEMS 적용</span>
                    )}
                  </div>
                  <div className="summary-text">{result.summary}</div>
                  {gemsText.trim() && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                      <i className="ti ti-adjustments-horizontal" style={{ fontSize: 11, marginRight: 3 }}></i>
                      <em>{gemsText}</em>
                    </div>
                  )}
                </div>
              )}
              <div className="results-header">
                <span className="results-title">추천 ATL 스킬</span>
                <span className="results-count">{result.recommendations?.length}개 추천</span>
              </div>
              {result.recommendations?.map((r, idx) => {
                const s = CAT[r.category] || { iconBg: '#5F5E5A', iconFill: '#F1EFE8', icon: 'ti-star' }
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
                    <div className="chips">
                      {r.activities?.map((a, ai) => <span key={ai} className="chip">{a}</span>)}
                    </div>
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
