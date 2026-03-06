import { getDatabase } from '../database'
import type { TokenUsage } from '../types'

/**
 * Get usage stats for a conversation.
 */
export function getConversationUsage(conversationId: string): {
  total_prompt_tokens: number
  total_completion_tokens: number
  total_model_calls: number
  total_tool_calls: number
} {
  const db = getDatabase()
  const row = db.prepare(
    `SELECT
       COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
       COALESCE(SUM(model_calls), 0) as total_model_calls,
       COALESCE(SUM(tool_calls), 0) as total_tool_calls
     FROM token_usage WHERE conversation_id = ?`
  ).get(conversationId) as {
    total_prompt_tokens: number
    total_completion_tokens: number
    total_model_calls: number
    total_tool_calls: number
  }
  return row
}

/**
 * Get usage records for a conversation.
 */
export function listTokenUsage(conversationId: string): TokenUsage[] {
  const db = getDatabase()
  return db.prepare(
    'SELECT * FROM token_usage WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId) as TokenUsage[]
}
