import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

const isBrowserEnvironment = typeof window !== 'undefined';

// jsdom does not implement matchMedia, so components that read media queries need a
// stand-in. Tests that depend on a specific media query stub it themselves.
if (isBrowserEnvironment && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  if (!isBrowserEnvironment) return;

  cleanup();
  localStorage.clear();
  document.documentElement.className = '';
});
