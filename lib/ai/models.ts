// Centralised model constants — change here to update all call sites
export const AI_MODELS = {
  // Complex reasoning, tool orchestration, strategic analysis
  PREMIUM: 'claude-sonnet-4-6',
  // Structured extraction, classification, summaries, template generation
  ECONOMY: 'claude-haiku-4-5-20251001',
} as const

export type AIModel = (typeof AI_MODELS)[keyof typeof AI_MODELS]
