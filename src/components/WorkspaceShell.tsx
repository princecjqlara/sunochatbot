'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, MessageCircle, X } from 'lucide-react';
import VeoDashboardNavigation from './VeoDashboardNavigation';
import VeoDashboardBreadcrumb from './VeoDashboardBreadcrumb';

export default function WorkspaceShell({ children, user, onSignOut, preview = false }: {
    children: ReactNode;
    user: { name?: string | null; email?: string | null; role?: string };
    onSignOut?: () => void;
    preview?: boolean;
}) {
    const pathname = usePathname();
    const [navigationOpen, setNavigationOpen] = useState(false);
    useEffect(() => { setNavigationOpen(false); }, [pathname]);
    useEffect(() => {
        if (!navigationOpen || typeof document === 'undefined') return;
        const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setNavigationOpen(false); };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [navigationOpen]);

    return <div className="min-h-screen md:flex">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <aside className="dashboard-sidebar shrink-0 border-b border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-[100dvh] md:w-64 md:flex-col md:border-b-0 md:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <Link href={preview ? '/ui-preview' : user.role ? '/dashboard/workspace' : '/dashboard'} prefetch={false} className="flex items-center gap-3 font-bold text-slate-900"><span className="rounded-xl bg-slate-900 p-2.5 text-white"><MessageCircle aria-hidden="true" className="h-5 w-5" /></span><span className="text-lg tracking-tight">SUNO<span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Workspace</span></span></Link>
                <button type="button" aria-label={navigationOpen ? 'Close menu' : 'Open menu'} aria-expanded={navigationOpen} aria-controls="dashboard-menu" onClick={() => setNavigationOpen(!navigationOpen)} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm md:hidden">{navigationOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}Menu</button>
            </div>
            <div id="dashboard-menu" className={`${navigationOpen ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col md:flex`}>
                <div className="flex-1 overflow-y-auto"><Suspense fallback={<p className="p-4 text-sm text-slate-500">Loading menu…</p>}><VeoDashboardNavigation role={user.role} preview={preview} onNavigate={() => setNavigationOpen(false)} /></Suspense></div>
                <div className="space-y-3 border-t border-slate-200 p-4">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{user.name || 'My account'}</p><p className="truncate text-xs text-slate-500">{user.email || ''}</p></div>
                    {preview ? <Link href="/" className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><LogOut aria-hidden="true" className="h-4 w-4" />Back to setup</Link> : <button type="button" onClick={onSignOut} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><LogOut aria-hidden="true" className="h-4 w-4" />Sign out</button>}
                </div>
            </div>
        </aside>
        <div className="min-w-0 flex-1">
            <header className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
                <Suspense fallback={<span className="text-sm text-slate-500">Workspace</span>}><VeoDashboardBreadcrumb role={user.role} preview={preview} /></Suspense>
                <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500"><span className="hidden sm:inline">Philippine time</span><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium capitalize text-slate-600">{preview ? 'UI preview' : user.role?.replaceAll('_', ' ') || 'My account'}</span></div>
            </header>
            <main id="main-content" tabIndex={-1} className="dashboard-content min-w-0 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
    </div>;
}
