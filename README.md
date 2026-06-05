# ATL 추천 에이전시

IB ATL(Approaches to Learning) 스킬 추천 도구.  
Next.js + Supabase + Vercel 스택으로 배포됩니다.

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| 프레임워크 | Next.js 15 (App Router) |
| AI | Google Gemini 2.0 Flash |
| DB | Supabase (PostgreSQL) |
| 배포 | Vercel |

---

## 배포 순서

### 1. Supabase 설정

1. [supabase.com](https://supabase.com) 접속 → 새 프로젝트 생성
2. **SQL Editor** 탭 열기 → `supabase/schema.sql` 내용 전체 붙여넣기 → **Run**
3. **Settings → API** 탭에서 아래 세 값 복사:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon / public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Gemini API 키 발급

1. [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) 접속
2. **Create API key** → 복사 → `GEMINI_API_KEY`

### 3. GitHub 업로드

```bash
git init
git add .
git commit -m "init: ATL 추천 에이전시"
git remote add origin https://github.com/<username>/atl-agency.git
git push -u origin main
```

> `.env.local`은 `.gitignore`에 포함되어 있어 자동으로 제외됩니다.

### 4. Vercel 배포

1. [vercel.com](https://vercel.com) → **Add New Project** → GitHub 저장소 선택
2. **Environment Variables** 섹션에서 아래 4개 추가:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
| `GEMINI_API_KEY` | Google AI Studio API key |

3. **Deploy** 클릭 → 완료

이후 GitHub에 push할 때마다 Vercel이 자동으로 재배포합니다.

---

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env.local
# .env.local 파일을 열어 4개 키 입력

# 3. 개발 서버 실행
npm run dev
# → http://localhost:3000
```

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/recommend` | Gemini 호출 + Supabase 저장 |
| GET  | `/api/history`   | 최근 추천 기록 20건 조회 |
