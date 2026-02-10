import Link, { type LinkProps } from 'next/link';
import { forwardRef, type AnchorHTMLAttributes } from 'react';

export interface LinkButtonProps
  extends LinkProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  ({ className = '', variant = 'default', size = 'default', children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-xl border border-transparent text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

    const variants = {
      default:
        'bg-slate-900 text-white shadow-soft hover:bg-slate-800 focus-visible:ring-slate-900',
      outline:
        'border-slate-200 bg-white/85 text-slate-700 shadow-sm backdrop-blur hover:bg-white focus-visible:ring-slate-600',
      ghost:
        'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 focus-visible:ring-slate-500',
      destructive:
        'bg-rose-600 text-white shadow-soft hover:bg-rose-700 focus-visible:ring-rose-600',
    } as const;

    const sizes = {
      default: 'h-10 px-4',
      sm: 'h-9 px-3 text-xs',
      lg: 'h-11 px-6 text-base',
      icon: 'h-10 w-10',
    } as const;

    return (
      <Link
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </Link>
    );
  },
);

LinkButton.displayName = 'LinkButton';

export { LinkButton };
