'use client';

import React, { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, LogOut, Menu, MessageCircle, X } from 'lucide-react';
import type { Page } from '@/legacy-runtime/types';
import SunoDashboardNavigation from '@/legacy-runtime/components/SunoDashboardNavigation';
import { sunoLocation } from '@/legacy-runtime/lib/suno-navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter(), pathname = usePathname();
    const [navigationOpen, setNavigationOpen] = useState(false);
    const [pages, setPages] = useState<Page[]>([]), [selectedPage, setSelectedPage] = useState('');
    const [pageLoading, setPageLoading] = useState(true), [pageError, setPageError] = useState(false), [retry, setRetry] = useState(0);
    useEffect(() => { if (status === 'unauthenticated') router.replace('/'); }, [status, router]);
    useEffect(() => { setNavigationOpen(false); }, [pathname]);
    useEffect(() => {
        if (!navigationOpen) return;
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setNavigationOpen(false); };
        document.addEventListener('keydown', close);
        return () => document.removeEventListener('keydown', close);
    }, [navigationOpen]);
    useEffect(() => {
        if (status !== 'authenticated') return;
        const controller = new AbortController();
        setPageLoading(true); setPageError(false);
        fetch('/api/pages', { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error('Pages unavailable');
            const body = await response.json();
            if (controller.signal.aborted) return;
            const nextPages: Page[] = Array.isArray(body.pages) ? body.pages : [];
            setPages(nextPages);
            setSelectedPage(current => nextPages.some(page => page.id === current) ? current : nextPages[0]?.id || '');
        }).catch(() => { if (!controller.signal.aborted) setPageError(true); })
            .finally(() => { if (!controller.signal.aborted) setPageLoading(false); });
        return () => controller.abort();
    }, [status, session?.user?.id, retry]);

    if (status !== 'authenticated' || !session) return <main className="flex min-h-screen items-center justify-center bg-slate-50"><p role="status" className="text-sm text-slate-600">{status === 'loading' ? 'Loading your workspace…' : 'Returning to sign in…'}</p></main>;
    const location = sunoLocation(pathname);
    return <div className="min-h-screen md:flex">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <aside className="dashboard-sidebar shrink-0 border-b border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-[100dvh] md:w-64 md:flex-col md:border-b-0 md:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <Link href="/dashboard" prefetch={false} className="flex items-center gap-3 font-bold text-slate-900"><span className="rounded-xl bg-slate-900 p-2.5 text-white"><MessageCircle aria-hidden="true" className="h-5 w-5" /></span><span className="text-lg tracking-tight">SUNO<span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Workspace</span></span></Link>
                <button type="button" aria-label={navigationOpen ? 'Close menu' : 'Open menu'} aria-expanded={navigationOpen} aria-controls="dashboard-menu" onClick={() => setNavigationOpen(!navigationOpen)} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm md:hidden">{navigationOpen ? <X aria-hidden="true" className="h-4 w-4" /> : <Menu aria-hidden="true" className="h-4 w-4" />}Menu</button>
            </div>
            <div id="dashboard-menu" className={`${navigationOpen ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col md:flex`}>
                <div className="border-b border-slate-100 px-4 py-4"><label htmlFor="connected-page" className="mb-2 block text-xs font-semibold text-slate-500">Connected Page</label><select id="connected-page" aria-label="Connected Facebook Page" className="input-wireframe" disabled={pageLoading || !pages.length} value={selectedPage} onChange={event => setSelectedPage(event.target.value)}>{!pages.length && <option value="">{pageLoading ? 'Loading Pages…' : pageError ? 'Pages unavailable' : 'No Pages connected'}</option>}{pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}</select>{pageError && <p role="alert" className="mt-2 text-xs text-amber-800">Your Pages could not be loaded. <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}</div>
                <div className="flex-1 overflow-y-auto"><SunoDashboardNavigation pathname={pathname} onNavigate={() => setNavigationOpen(false)} /></div>
                <div className="space-y-3 border-t border-slate-200 p-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{session.user?.name || 'My account'}</p><p className="truncate text-xs text-slate-500">{session.user?.email || ''}</p></div><button type="button" onClick={() => void signOut({ callbackUrl: '/' })} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><LogOut aria-hidden="true" className="h-4 w-4" />Sign out</button></div>
            </div>
        </aside>
        <div className="min-w-0 flex-1">
            <header className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8"><div aria-label="Current location" className="flex min-w-0 items-center gap-2 text-sm"><span className="hidden text-slate-400 sm:inline">{location.group}</span><ChevronRight aria-hidden="true" className="hidden h-3.5 w-3.5 shrink-0 text-slate-300 sm:block" /><span className="truncate font-medium text-slate-700">{location.label}</span></div><div className="flex shrink-0 items-center gap-3 text-xs text-slate-500"><span className="hidden sm:inline">Philippine time</span><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">Sunochatbot</span></div></header>
            <main id="main-content" tabIndex={-1} className="dashboard-content min-w-0 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"><div className="dashboard-page">{children}</div></main>
        </div>
    </div>;
}
