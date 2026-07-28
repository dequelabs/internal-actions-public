import type { SizeMap } from './types.ts'

const UNIT_MULTIPLIERS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3
}

/**
 * Parse a byte count from a plain integer string or a value with a kb/mb/gb suffix.
 * Examples: "153600", "150kb", "7mb", "1.5 MB"
 */
export function parseBytes(input: string): number {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Empty byte value')
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/)
  if (!match) {
    throw new Error(`Invalid byte value: ${input}`)
  }

  const amount = Number(match[1])
  // Huge digit strings can overflow to Infinity.
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid byte value: ${input}`)
  }

  const unit = (match[2] || 'b').toLowerCase()
  const multiplier = UNIT_MULTIPLIERS[unit]
  if (multiplier == null) {
    throw new Error(
      `Unknown byte unit "${match[2]}". Use b, kb, mb, or gb (or a plain integer).`
    )
  }

  return Math.round(amount * multiplier)
}

export function parseRatio(input: string, name: string): number {
  const value = Number(input)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${name}: ${input}`)
  }
  return value
}

export function parseBoolean(input: string): boolean {
  return input.trim().toLowerCase() === 'true'
}

export function parseSizeMap(raw: string, label: string): SizeMap {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Could not parse ${label} as JSON: ${(error as Error).message}`
    )
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object of name → bytes`)
  }

  const map: SizeMap = {}
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>
  )) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(
        `${label} entry "${key}" must be a non-negative number of bytes`
      )
    }
    map[key] = value
  }
  return map
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
