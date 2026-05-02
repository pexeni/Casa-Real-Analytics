'use client';
/**
 * Nav link with active state. Marks itself active when the current path
 * starts with `href` — keeps `/reportes/123` highlighting the parent tab.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Props {
  href: string;
  children: React.ReactNode;
}

export function NavLink({ href, children }: Props) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative rounded-md px-2 py-1 text-sm transition-colors',
        active
          ? 'text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-2 -bottom-[13px] h-[2px] rounded-full bg-primary"
        />
      ) : null}
    </Link>
  );
}
