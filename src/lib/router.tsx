'use client';

import { usePathname,useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode, type MouseEventHandler } from 'react';

/** Real page URLs; legacy #/ links redirect to their canonical page. */
export function normalizeHash(): string {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return window.location.pathname;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/** Возвращает текущий путь хэша; null — пока страница не смонтирована на клиенте. */
export function useHashRoute(initialRoute?:string): string | null {
  const pathname=usePathname();const router=useRouter();
  const [route, setRoute] = useState<string | null>(initialRoute??null);

  useEffect(() => {
    const read = () => {const target=normalizeHash();setRoute(target);if(window.location.hash.startsWith('#/'))router.replace(target);};
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [pathname,router]);

  return route;
}

export function navigate(to: string) {
  const target = to.startsWith('/') ? to : `/${to}`;
  if (normalizeHash() === target) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  window.location.assign(target);
}

/** Плавный скролл к блоку на текущей странице (внутренние якоря конфликтуют с хэш-роутом). */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function SiteLink({
  to,
  children,
  className,
  ariaLabel,
  onClick,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <a href={to} aria-label={ariaLabel} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
