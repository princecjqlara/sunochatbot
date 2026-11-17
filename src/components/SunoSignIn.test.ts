import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }), signIn: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => m.params }));
import SunoSignIn from './SunoSignIn';

it('renders the Veo-style account form with email/password and retained Facebook access', () => {
    const html = renderToStaticMarkup(createElement(SunoSignIn));
    expect(html).toContain('Welcome back'); expect(html).toContain('Sunochatbot workspace');
    expect(html).toContain('type="email"'); expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"'); expect(html).toContain('Continue with Facebook');
    expect(html).not.toContain('Setup is in progress'); expect(html).not.toContain('ui-preview');
});

it('shows a useful failure message without echoing an arbitrary query value', () => {
    m.params = new URLSearchParams('error=CredentialsSignin');
    expect(renderToStaticMarkup(createElement(SunoSignIn))).toContain('The email or password was not recognized');
    m.params = new URLSearchParams('error=untrusted-query-text');
    expect(renderToStaticMarkup(createElement(SunoSignIn))).not.toContain('untrusted-query-text');
    m.params = new URLSearchParams();
});
