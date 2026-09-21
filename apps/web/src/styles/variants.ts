import { cva } from 'class-variance-authority';

/** Reusable keyboard focus treatment; individual components own disabled semantics. */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export const buttonVariants = cva(
  `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ${focusRing}`,
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
        outline: 'border border-input bg-card text-card-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-control-sm px-3',
        default: 'h-control px-4',
        lg: 'h-control-lg px-6',
        icon: 'size-control',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

/** Styling only: callers select semantic HTML elements (h1, h2, p, label). */
export const typographyVariants = cva('', {
  variants: {
    variant: {
      pageTitle: 'text-2xl font-semibold tracking-heading sm:text-3xl',
      sectionTitle: 'text-lg font-semibold',
      body: 'text-base',
      bodySmall: 'text-sm',
      caption: 'text-xs',
      label: 'text-sm font-medium',
      eyebrow: 'text-sm font-semibold tracking-label',
    },
    tone: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
      primary: 'text-primary',
      success: 'text-success',
      warning: 'text-warning',
      info: 'text-info',
      danger: 'text-danger',
    },
  },
  defaultVariants: { variant: 'body', tone: 'default' },
});

export const surfaceVariants = cva('rounded-xl border border-border', {
  variants: {
    variant: {
      default: 'bg-card text-card-foreground',
      muted: 'bg-muted text-foreground',
      elevated: 'bg-card text-card-foreground shadow-surface',
    },
    padding: { none: 'p-0', sm: 'p-4', default: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' },
  },
  defaultVariants: { variant: 'default', padding: 'default' },
});
