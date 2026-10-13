// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { spanishFor, translateSdk, watchSdk } from './sdkSpanish';

describe("the login SDK's words in Spanish", () => {
  it('keeps the spaces around a text', () => {
    expect(spanishFor('Back this up ')).toBe('Guardá esto ');
    expect(spanishFor(" you continue. Lose it and your identity is gone — there's no recovery.")).toBe(' de seguir. Si la perdés, perdés tu identidad: no hay forma de recuperarla.');
    expect(spanishFor('Something else')).toBeNull();
  });
  it('translates texts, placeholders and labels inside the SDK only', () => {
    document.body.innerHTML = `
      <div class="nui-modal" aria-label="Sign in to Nostr">
        <span class="nui-method-label">Create a new account</span>
        <input class="nui-input" placeholder="nsec1… or 64-char hex" />
        <button class="nui-back">← Back</button>
      </div>
      <p class="mine">Create a new account</p>`;
    translateSdk(document.body);
    expect(document.querySelector('.nui-method-label')!.textContent).toBe('Crear una cuenta nueva');
    expect(document.querySelector('input')!.getAttribute('placeholder')).toBe('nsec1… o hex de 64 caracteres');
    expect(document.querySelector('.nui-modal')!.getAttribute('aria-label')).toBe('Conectate a Nostr');
    expect(document.querySelector('.nui-back')!.textContent).toBe('← Volver');
    expect(document.querySelector('.mine')!.textContent).toBe('Create a new account');
  });
  it('keeps translating what the SDK renders later', async () => {
    document.body.innerHTML = '<div class="nui-modal"></div>';
    const stop = watchSdk(document.body);
    const b = document.createElement('button');
    b.className = 'nui-primary';
    b.textContent = 'Sign in';
    document.querySelector('.nui-modal')!.append(b);
    await new Promise((r) => setTimeout(r, 0));
    expect(b.textContent).toBe('Entrar');
    b.firstChild!.nodeValue = 'Continue';
    await new Promise((r) => setTimeout(r, 0));
    expect(b.textContent).toBe('Continuar');
    stop();
  });
});
