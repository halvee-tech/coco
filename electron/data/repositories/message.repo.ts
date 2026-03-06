import { getDatabase } from '../database'
import type { Message, TokenUsage } from '../types'
import { genId, now } from '../utils'

export function getMessages(conversationId: string): Message[] {
  const db = getDatabase()
  return db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId) as Message[]
}

export function getMessage(id: string): Message | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | undefined
}

/**
 * Turn-Level Batch Write: write messages + token usage in a single transaction.
 * Called after each model turn completes.
 */
export function writeTurn(
  messages: Array<Omit<Message, 'id' | 'created_at'> & { id?: string }>,
  usage?: Omit<TokenUsage, 'id' | 'created_at'> & { id?: string }
): void {
  const db = getDatabase()
  const ts = now()

  const txn = db.transaction(() => {
    const insertMsg = db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, status, tool_calls, tool_call_id, model_id, token_input, token_output, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const msg of messages) {
      insertMsg.run(
        msg.id ?? genId(), msg.conversation_id, msg.role, msg.content,
        msg.status ?? 'complete', msg.tool_calls ?? null, msg.tool_call_id ?? null,
        msg.model_id ?? null, msg.token_input ?? null, msg.token_output ?? null,
        msg.duration_ms ?? null, ts
      )
    }

    if (usage) {
      db.prepare(
        `INSERT INTO token_usage (id, conversation_id, provider_id, model_id, prompt_tokens, completion_tokens, model_calls, tool_calls, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        usage.id ?? genId(), usage.conversation_id, usage.provider_id, usage.model_id,
        usage.prompt_tokens, usage.completion_tokens, usage.model_calls, usage.tool_calls, ts
      )
    }
  })

  txn()
}

/**
 * Delete the last assistant turn (for regenerate).
 * Removes assistant messages + tool messages from the last turn.
 */
export function deleteLastAssistantTurn(conversationId: string): void {
  const db = getDatabase()
  // Find the last user message
  const lastUserMsg = db.prepare(
    `SELECT id, created_at FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1`
  ).get(conversationId) as { id: string; created_at: string } | undefined

  if (!lastUserMsg) return

  // Delete all messages after the last user message
  db.prepare(
    `DELETE FROM messages WHERE conversation_id = ? AND created_at > ?`
  ).run(conversationId, lastUserMsg.created_at)
}
