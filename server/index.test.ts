import { describe, it, expect } from 'vitest';
process.env.NODE_ENV = 'test';
const { resolveStatic, SECURITY_HEADERS } = await import('./index');

describe('static host', () => {
  it('never resolves outside the client build', () => {
    for (const p of ['/../../.env', '/..%2f..%2f.env', '/%2e%2e/%2e%2e/etc/passwd']) {
      const r = resolveStatic(p);
      expect(r === null || r.file.includes('/dist/client/')).toBe(true);
    }
  });
  it('serves no keys and allows only first-party scripts', () => {
    expect(SECURITY_HEADERS['content-security-policy']).toContain("script-src 'self'");
    expect(SECURITY_HEADERS['content-security-policy']).toContain('connect-src');
    // GLB textures load through blob: URLs; meshopt decodes with WebAssembly.
    expect(SECURITY_HEADERS['content-security-policy']).toMatch(/connect-src[^;]*blob:/);
    expect(SECURITY_HEADERS['content-security-policy']).toMatch(/script-src[^;]*'wasm-unsafe-eval'/);
    expect(SECURITY_HEADERS['content-security-policy']).not.toMatch(/'unsafe-eval'/);
  });
});
