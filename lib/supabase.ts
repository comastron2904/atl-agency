import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type ATLRecommendation = {
  id?: string
  created_at?: string
  lesson_description: string
  lesson_types: string[]
  grade: string
  atl_categories: string[]
  gems_instruction: string | null
  summary: string
  recommendations: RecommendationItem[]
  used_files: string[]
}

export type RecommendationItem = {
  category: string
  skill: string
  relevance: 'high' | 'mid'
  description: string
  reason: string
  activities: string[]
}
