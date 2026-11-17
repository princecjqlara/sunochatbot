import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ params: new URLSearchParams(), notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/ui-preview', useSearchParams: () => m.params, notFound: m.notFound }));
vi.mock('next/link', () => ({ default: ({ href, children, prefetch, ...props }: any) => createElement('a', { href, ...props }, children) }));
import WorkspacePreview from './WorkspacePreview';
import WorkspacePreviewPage from '@/app/ui-preview/page';
import HomePage from '@/app/page';
import { dashboardNavigation } from '@/lib/veo-navigation';
const text = (node: any): string => typeof node === 'string' || typeof node === 'number' ? String(node) : node.children.map(text).join('');

beforeEach(() => { m.params = new URLSearchParams(); vi.stubEnv('SUNO_DEPLOYMENT_STAGE', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('renders the shared workspace with fictional teams, makes no data requests and keeps all links inside the preview', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    let view: any; await act(async () => { view = create(createElement(WorkspacePreview)); });
    try {
        expect(text(view.root.findByProps({ role: 'note' }))).toContain('Sample data only.');
        expect(view.root.findAllByType('article')).toHaveLength(2);
        const links = view.root.findAllByType('a').map((link: any) => link.props.href as string);
        expect(links.every((href: string) => href.startsWith('/ui-preview') || href === '/' || href === '#main-content')).toBe(true);
        expect(view.root.findAllByType('a').filter((link: any) => link.props['aria-current'] === 'page')).toHaveLength(1);
        await act(async () => view.root.findAllByType('select')[0].props.onChange({ target: { value: 'sample-leader-a' } }));
        expect(view.root.findAllByType('article')).toHaveLength(1);
        expect(fetcher).not.toHaveBeenCalled();
    } finally { await act(async () => view.unmount()); }
});

it('searches sample clients locally and keeps the contact breadcrumb and navigation in sync', async () => {
    m.params = new URLSearchParams({ page: '/dashboard/contacts' });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    let view: any; await act(async () => { view = create(createElement(WorkspacePreview)); });
    try {
        expect(view.root.findAllByType('tbody')[0].findAllByType('tr')).toHaveLength(3);
        expect(view.root.findAllByType('a').find((link: any) => link.props['aria-current'] === 'page')?.props.href).toBe('/ui-preview?page=%2Fdashboard%2Fcontacts');
        const search = view.root.findByProps({ 'aria-label': 'Search sample clients' });
        await act(async () => search.props.onChange({ target: { value: 'Birthday' } }));
        expect(view.root.findAllByType('tbody')[0].findAllByType('tr')).toHaveLength(1);
        await act(async () => search.props.onChange({ target: { value: 'no match' } }));
        expect(view.root.findByProps({ role: 'status' }).children.join('')).toContain('No sample clients');
        expect(fetcher).not.toHaveBeenCalled();
    } finally { await act(async () => view.unmount()); }
});

it('falls back to the sample dashboard for unrecognized or malformed destinations', async () => {
    m.params = new URLSearchParams({ page: 'http://[' });
    let view: any; await act(async () => { view = create(createElement(WorkspacePreview)); });
    try { expect(view.root.findByType('h1').children.join('')).toBe('Teams dashboard'); }
    finally { await act(async () => view.unmount()); }
});

it.each(['production', 'test'])('does not serve the preview in %s outside setup', environment => {
    vi.stubEnv('NODE_ENV', environment);
    expect(() => WorkspacePreviewPage()).toThrow('NOT_FOUND');
});

it('serves the preview in the development server', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(WorkspacePreviewPage()).toBeTruthy();
});

it('offers the preview from the production setup page without opening live workspace access', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUNO_DEPLOYMENT_STAGE', 'setup');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(WorkspacePreviewPage()).toBeTruthy();
    let view: any; await act(async () => { view = create(createElement(HomePage)); });
    try {
        expect(view.root.findByType('a').props.href).toBe('/ui-preview');
        expect(text(view.root)).toContain('Setup is in progress');
        expect(view.root.findAllByType('form')).toHaveLength(0);
        expect(fetcher).not.toHaveBeenCalled();
    } finally { await act(async () => view.unmount()); }
});

it('opens every preview menu destination with the matching heading and active navigation', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    let view: any; await act(async () => { view = create(createElement(WorkspacePreview)); });
    try {
        for (const item of dashboardNavigation('owner').flatMap(group => group.items)) {
            m.params = new URLSearchParams({ page: item.href });
            await act(async () => view.update(createElement(WorkspacePreview)));
            expect(text(view.root.findByType('h1'))).toBe(item.label);
            const active = view.root.findAllByType('a').filter((link: any) => link.props['aria-current'] === 'page');
            expect(active.map((link: any) => link.props.href)).toEqual(['/ui-preview?page=' + encodeURIComponent(item.href)]);
        }
        expect(fetcher).not.toHaveBeenCalled();
    } finally { await act(async () => view.unmount()); }
});
