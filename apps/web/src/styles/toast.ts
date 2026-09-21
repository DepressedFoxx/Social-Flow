import type { CSSProperties } from 'react';

/** Sonner consumes CSS variables; keep its palette tied to the app tokens. */
export const toastStyles = {
  fontFamily: 'var(--font-family-sans)',
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--success-bg': 'var(--success-subtle)',
  '--success-text': 'var(--success)',
  '--success-border': 'var(--success-subtle)',
  '--info-bg': 'var(--info-subtle)',
  '--info-text': 'var(--info)',
  '--info-border': 'var(--info-subtle)',
  '--warning-bg': 'var(--warning-subtle)',
  '--warning-text': 'var(--warning)',
  '--warning-border': 'var(--warning-subtle)',
  '--error-bg': 'var(--danger-subtle)',
  '--error-text': 'var(--danger)',
  '--error-border': 'var(--danger-subtle)',
  '--border-radius': 'var(--radius)',
} satisfies CSSProperties & Record<`--${string}`, string>;
