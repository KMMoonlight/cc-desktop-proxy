import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
  {
    variants: {
      variant: {
        default: 'border-primary/10 bg-primary/10 text-primary hover:bg-primary/14',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border-border bg-background/90 text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
