// Prompt-injection defense layer.
//
// Any free-text field that could originate from outside the system (a
// customer-supplied note, a webhook payload string, etc.) is UNTRUSTED DATA.
// It must never be interpreted as an instruction by an agent or by Gemini.
//
// This module gives every agent a single choke point for handling such text:
//   1. detectInjection() flags known instruction-override patterns.
//   2. sanitizeForPrompt() wraps untrusted text in explicit delimiters and
//      strips characters commonly used to break out of a prompt, so that
//      even if Gemini is asked to summarize it, the text cannot be executed
//      as a directive.
//   3. Governance Agent (lib/agents/governance.ts) escalates any detected
//      finding to at least BLOCK, regardless of what the text asked for.

import type { SecurityFinding } from './types';

const INJECTION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /ignore (?:all|any|the)?\s*(previous|above|prior) instructions?/i, label: 'instruction-override' },
  { pattern: /disregard (the )?(system|previous|above)/i, label: 'instruction-override' },
  { pattern: /you are now/i, label: 'role-override' },
  { pattern: /act as (an?|the)/i, label: 'role-override' },
  { pattern: /system\s*:/i, label: 'fake-system-turn' },
  { pattern: /reveal (the )?(system )?prompt/i, label: 'prompt-exfiltration' },
  { pattern: /(approve|execute|process|issue) (this|the|a|an)?\s*(refund|payment|transfer|chargeback)/i, label: 'fund-movement-request' },
  { pattern: /(send|wire|transfer) (money|funds)/i, label: 'fund-movement-request' },
  { pattern: /disable (logging|governance|audit)/i, label: 'control-bypass-request' },
  { pattern: /without (human )?approval/i, label: 'control-bypass-request' },
];

export function detectInjection(source: string, text: string | undefined | null): SecurityFinding[] {
  if (!text) return [];
  const findings: SecurityFinding[] = [];
  for (const { pattern, label } of INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        source,
        matchedPattern: label,
        excerpt: match[0].slice(0, 120),
        action: 'blocked',
      });
    }
  }
  return findings;
}

/**
 * Wraps untrusted text so it is unambiguously data, not an instruction, if
 * it is ever included in a Gemini prompt. Strips characters used for
 * delimiter/fence breakout attempts.
 */
export function sanitizeForPrompt(text: string | undefined | null): string {
  if (!text) return '';
  const controlCharPattern = new RegExp('[\\x00-\\x1F\\x7F]', 'g');
  const stripped = text
    .replace(/```/g, "'''")
    .replace(controlCharPattern, ' ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 500);
  return `[UNTRUSTED_CUSTOMER_TEXT_START] ${stripped} [UNTRUSTED_CUSTOMER_TEXT_END]`;
}
