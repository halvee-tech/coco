import { randomUUID } from 'crypto'

export function genId(): string {
  return randomUUID()
}

export function now(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
}
