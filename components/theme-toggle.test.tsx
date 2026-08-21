import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

const renderThemeToggle = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );

const getToggle = (targetTheme: 'dark' | 'light') =>
  screen.getByRole('button', { name: `Switch to ${targetTheme} mode` });

describe('Theme toggle', () => {
  it('offers the dark theme when the light theme is active', () => {
    renderThemeToggle();

    expect(getToggle('dark')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('light');
  });

  it('applies the dark theme when clicked', async () => {
    renderThemeToggle();

    await userEvent.click(getToggle('dark'));

    expect(getToggle('light')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).not.toHaveClass('light');
  });

  it('returns to the light theme when clicked twice', async () => {
    renderThemeToggle();

    await userEvent.click(getToggle('dark'));
    await userEvent.click(getToggle('light'));

    expect(getToggle('dark')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('light');
  });

  it('remembers the chosen theme for the next visit', async () => {
    const { unmount } = renderThemeToggle();
    await userEvent.click(getToggle('dark'));
    unmount();

    renderThemeToggle();

    expect(getToggle('light')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('starts in dark mode when the operating system prefers dark', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList
    );

    renderThemeToggle();

    expect(getToggle('light')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('dark');
  });
});
