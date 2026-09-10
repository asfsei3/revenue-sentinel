import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// These tests exercise the real Gemini call path in lib/gemini/client.ts by
// mocking global.fetch, so they run deterministically with no real network
// access — but they prove the code actually performs an HTTP call to the
// Gemini API and correctly parses success/failure/timeout responses,
// distinct from the manually-verified live check documented in README.md.

describe('callGemini', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.AGENT_MODE = 'gemini';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns the Gemini response text and mode "gemini" on a successful call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toContain('generativelanguage.googleapis.com');
        expect(url).toContain('key=test-key');
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: '  Likely a PSP-side issue.  ' }] } }] }),
          { status: 200 },
        );
      }),
    );
    const { callGemini } = await import('../lib/gemini/client');
    const result = await callGemini(
      { agent: 'diagnosis', systemInstruction: 'sys', prompt: 'p' },
      () => 'fallback',
    );
    expect(result.mode).toBe('gemini');
    expect(result.text).toBe('Likely a PSP-side issue.');
  });

  it('falls back to mock when Gemini returns a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad request', { status: 400 })));
    const { callGemini } = await import('../lib/gemini/client');
    const result = await callGemini({ agent: 'diagnosis', systemInstruction: 'sys', prompt: 'p' }, () => 'fallback text');
    expect(result.mode).toBe('mock');
    expect(result.text).toBe('fallback text');
  });

  it('falls back to mock when Gemini returns an empty/malformed body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })));
    const { callGemini } = await import('../lib/gemini/client');
    const result = await callGemini({ agent: 'diagnosis', systemInstruction: 'sys', prompt: 'p' }, () => 'fallback text');
    expect(result.mode).toBe('mock');
    expect(result.text).toBe('fallback text');
  });

  it('falls back to mock when the network call throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const { callGemini } = await import('../lib/gemini/client');
    const result = await callGemini({ agent: 'diagnosis', systemInstruction: 'sys', prompt: 'p' }, () => 'fallback text');
    expect(result.mode).toBe('mock');
    expect(result.text).toBe('fallback text');
  });

  it('never calls fetch when no API key is configured (mock mode)', async () => {
    process.env.GEMINI_API_KEY = '';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { callGemini } = await import('../lib/gemini/client');
    const result = await callGemini({ agent: 'diagnosis', systemInstruction: 'sys', prompt: 'p' }, () => 'fallback text');
    expect(result.mode).toBe('mock');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
