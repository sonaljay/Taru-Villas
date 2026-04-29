import type { CoreAspectKey } from './aspects'

export interface CoreAspectScore {
  score: number
  mention_count: number
  sample_quote: string
}

export interface DynamicAspect {
  name: string
  score: number
  mention_count: number
}

export interface AspectScores {
  core: Record<CoreAspectKey, CoreAspectScore>
  dynamic: DynamicAspect[]
}

export interface Bullet {
  headline: string
  detail: string
  mention_count: number
}

export type Severity = 'low' | 'medium' | 'high'

export interface RepetitiveIssue extends Bullet {
  severity: Severity
}

export type SynthesisStatus = 'ok' | 'insufficient_data' | 'error'

export interface SynthesisOutput {
  aspect_scores: AspectScores
  strengths: Bullet[]
  weaknesses: Bullet[]
  repetitive_issues: RepetitiveIssue[]
}

export interface AspectTrend {
  key: string
  label: string
  current: number
  previous: number
  delta: number
}
