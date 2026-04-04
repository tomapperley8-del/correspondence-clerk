// Centralised model constants — change here to update all call sites
export const AI_MODELS = {
  // Complex reasoning, tool orchestration, strategic analysis
  PREMIUM: 'claude-sonnet-4-5-20250929',
  // Structured extraction, classification, summaries, template generation
  ECONOMY: 'claude-haiku-4-5-20250514',
} as const

export type AIModel = (typeof AI_MODELS)[keyof typeof AI_MODELS]
