import {NextResponse, type NextRequest} from 'next/server';
import {resolvePortalKind} from '@/lib/portals';

/**
 * Host-aware routing for staff CMS (SPO-20).
 * cms.solo-pr.ru → prefer /admin; public apex keeps learner paths.
 * Cookie Domain is not set here (sessions stay host-scoped).
 */
export function proxy(req: NextRequest) {
  const kind = resolvePortalKind(req.headers.get('host'));
  const {pathname} = req.nextUrl;

  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  if (kind === 'cms') {
    // Staff CMS host: send bare root to admin shell.
    if (pathname === '/' || pathname === '') {
      const url = req.nextUrl.clone();
      url.pathname = '/admin';
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next();
  res.headers.set('x-solo-portal', kind);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/|images/).*)'],
};
