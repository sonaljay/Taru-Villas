import Anthropic from '@anthropic-ai/sdk'
import { CORE_ASPECTS } from './aspects'
import type { SynthesisOutput } from './types'

export const PROMPT_VERSION = 'v1'
export const SYNTHESIS_MODEL = 'claude-sonnet-4-6'

// Sonnet 4.6 published rates (USD per million tokens). Bump if Anthropic changes pricing.
const PRICE_INPUT_PER_MTOK = 3.0
const PRICE_OUTPUT_PER_MTOK = 15.0
const PRICE_CACHE_WRITE_PER_MTOK = 3.75
const PRICE_CACHE_READ_PER_MTOK = 0.3

const SYSTEM_PROMPT = `You are a senior hospitality review analyst. Given guest reviews for a hotel property, produce structured insights for property managers.

Output a JSON object via the synthesize_reviews tool with:

  aspect_scores.core: for each fixed aspect (${CORE_ASPECTS.map((a) => a.key).join(', ')}), a 0-10 score, a mention_count (number of input reviews touching this theme), and a brief sample_quote pulled verbatim from the reviews. Score 0 and mention_count 0 if not mentioned.

  aspect_scores.dynamic: 1-2 property-specific aspects beyond the core (e.g., "Pool", "Beach access") with the same fields. Use only if at least 3 reviews mention the theme. Cap at 2.

  strengths: 3-5 themes guests consistently praise. Each has headline (short), detail (1 concrete sentence), mention_count.

  weaknesses: 3-5 themes guests criticize. Same shape as strengths.

  repetitive_issues: themes mentioned in 3+ reviews indicating a structural problem. Each has headline, detail, mention_count, and severity (low|medium|high). Severity high = safety/health/major booking blocker; medium = repeated dissatisfaction; low = mild but persistent.

Rules:
  - Be concrete. "Hot water inconsistent in upper rooms" beats "Plumbing issues".
  - mention_count = number of distinct input reviews touching the theme.
  - Use the 0-10 scale (not 1-5, not percentages).
  - Don't invent themes. If the review set is thin, return shorter lists.
  - Quote verbatim — never paraphrase a sample_quote.`

const SYNTHESIS_TOOL: Anthropic.Messages.Tool = {
  name: 'synthesize_reviews',
  description: 'Produce structured insights from guest reviews',
  input_schema: {
    type: 'object' as const,
    required: ['aspect_scores', 'strengths', 'weaknesses', 'repetitive_issues'],
    properties: {
      aspect_scores: {
        type: 'object',
        required: ['core', 'dynamic'],
        properties: {
          core: {
            type: 'object',
            required: CORE_ASPECTS.map((a) => a.key),
            properties: Object.fromEntries(
              CORE_ASPECTS.map((a) => [
                a.key,
                {
                  type: 'object',
                  required: ['score', 'mention_count', 'sample_quote'],
                  properties: {
                    score: { type: 'number', minimum: 0, maximum: 10 },
                    mention_count: { type: 'integer', minimum: 0 },
                    sample_quote: { type: 'string' },
                  },
                },
              ])
            ),
          },
          dynamic: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              required: ['name', 'score', 'mention_count'],
              properties: {
                name: { type: 'string' },
                score: { type: 'number', minimum: 0, maximum: 10 },
                mention_count: { type: 'integer', minimum: 0 },
              },
            },
          },
        },
      },
      strengths: {
        type: 'array',
        items: {
          type: 'object',
          required: ['headline', 'detail', 'mention_count'],
          properties: {
            headline: { type: 'string' },
            detail: { type: 'string' },
            mention_count: { type: 'integer', minimum: 0 },
          },
        },
      },
      weaknesses: {
        type: 'array',
        items: {
          type: 'object',
          required: ['headline', 'detail', 'mention_count'],
          properties: {
            headline: { type: 'string' },
            detail: { type: 'string' },
            mention_count: { type: 'integer', minimum: 0 },
          },
        },
      },
      repetitive_issues: {
        type: 'array',
        items: {
          type: 'object',
          required: ['headline', 'detail', 'mention_count', 'severity'],
          properties: {
            headline: { type: 'string' },
            detail: { type: 'string' },
            mention_count: { type: 'integer', minimum: 0 },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
      },
    },
  },
}

export interface ReviewForPrompt {
  reviewedAt: Date
  rating: number
  text: string
}

export interface SynthesisResult {
  output: SynthesisOutput
  modelUsed: string
  promptVersion: string
  costUsd: number
}

export async function synthesizeReviews(args: {
  propertyName: string
  windowStart: Date
  windowEnd: Date
  reviews: ReviewForPrompt[]
}): Promise<SynthesisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const client = new Anthropic({ apiKey })

  const userText = [
    `Property: ${args.propertyName}`,
    `Window: ${args.windowStart.toISOString().slice(0, 10)} to ${args.windowEnd.toISOString().slice(0, 10)}`,
    `Review count: ${args.reviews.length}`,
    ``,
    `Reviews:`,
    ...args.reviews.map(
      (r, i) => `[${i + 1}] ${r.reviewedAt.toISOString().slice(0, 10)} | ${r.rating}/5 | "${r.text.replace(/\n/g, ' ')}"`
    ),
  ].join('\n')

  const response = await client.messages.create({
    model: SYNTHESIS_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [SYNTHESIS_TOOL],
    tool_choice: { type: 'tool', name: SYNTHESIS_TOOL.name },
    messages: [{ role: 'user', content: userText }],
  })

  const toolUse = response.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`Anthropic did not return tool_use; stop_reason=${response.stop_reason}`)
  }

  const usage = response.usage
  const costUsd =
    ((usage.input_tokens ?? 0) * PRICE_INPUT_PER_MTOK) / 1_000_000 +
    ((usage.output_tokens ?? 0) * PRICE_OUTPUT_PER_MTOK) / 1_000_000 +
    ((usage.cache_creation_input_tokens ?? 0) * PRICE_CACHE_WRITE_PER_MTOK) / 1_000_000 +
    ((usage.cache_read_input_tokens ?? 0) * PRICE_CACHE_READ_PER_MTOK) / 1_000_000

  return {
    output: toolUse.input as SynthesisOutput,
    modelUsed: SYNTHESIS_MODEL,
    promptVersion: PROMPT_VERSION,
    costUsd: Math.round(costUsd * 10000) / 10000,
  }
}
