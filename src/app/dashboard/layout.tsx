'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import SunoEarningsPolicyGate from '@/components/SunoEarningsPolicyGate';
import VeoTelegramProfile from '@/components/VeoTelegramProfile';
import VeoTelegramReminder from '@/components/VeoTelegramReminder';
import WorkspaceShell from '@/components/WorkspaceShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { data: session, status, update } = useSession();
    const router = useRouter(), pathname = usePathname();
    const [reconnecting, setReconnecting] = useState(false), [connectionError, setConnectionError] = useState('');
    async function reconnect() {
        setReconnecting(true);setConnectionError('');
        try {
            const refreshed = await update();
            if (refreshed?.user.workspaceUnavailable) setConnectionError('The connection is still unavailable. Please try again shortly.');
        } catch { setConnectionError('The connection is still unavailable. Please try again shortly.'); }
        finally { setReconnecting(false); }
    }
    const adsBlocked = !!session?.user.role && !['owner', 'team_leader'].includes(session.user.role) && pathname.startsWith('/dashboard/ad-');
    useEffect(() => { if (adsBlocked) router.replace('/dashboard/workspace'); }, [adsBlocked, router]);
    useEffect(() => {
        if (status === 'authenticated' && !session?.user.id && !session?.user.suspension) { void signOut({ callbackUrl: '/' }); return; }
        if (status === 'unauthenticated') router.push('/');
    }, [status, router, session?.user.id, session?.user.suspension]);

    if (status !== 'authenticated' || !session?.user.id && !session?.user.suspension) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p role="status" className="text-sm text-slate-600">{status === 'loading' ? 'Loading your workspace…' : 'Returning to sign in…'}</p></div>;
    if (session.user.suspension) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section role="alert" className="w-full max-w-lg space-y-4 rounded-xl border border-red-200 bg-white p-6"><h1 className="text-xl font-semibold">Account suspended</h1><p className="text-sm">{session.user.suspension.reason}</p><p className="text-sm">{session.user.suspension.ends_at ? 'Scheduled to end: ' + new Date(session.user.suspension.ends_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) + ' PHT.' : 'A Manager or Team Leader must lift this suspension.'} Contact your supervisor for help.</p><button type="button" className="text-sm underline" onClick={() => void signOut({ callbackUrl: '/' })}>Sign out</button></section></main>;
    if (session.user.workspaceUnavailable) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section role="alert" className="w-full max-w-lg space-y-4 rounded-xl border bg-white p-6"><h1 className="text-xl font-semibold">SUNO is temporarily unavailable</h1><p className="text-sm">We could not connect to the workspace database. Your sign-in is retained. Reconnect to check access again.</p>{connectionError && <p className="text-sm text-red-700">{connectionError}</p>}<div className="flex flex-wrap gap-4"><button type="button" disabled={reconnecting} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40" onClick={() => void reconnect()}>{reconnecting ? 'Reconnecting…' : 'Reconnect'}</button><button type="button" className="text-sm underline" onClick={() => void signOut({ callbackUrl: '/' })}>Sign out</button></div></section></main>;
    if (adsBlocked) return <p role="status" className="p-6">Returning to your workspace…</p>;
    if (session.user.role && session.user.role !== 'owner' && !session.user.telegramProfileConfirmed) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section className="w-full max-w-lg"><VeoTelegramProfile confirmation /><button className="mx-auto mt-4 block text-sm text-slate-600 underline" onClick={() => void signOut({ callbackUrl: '/' })}>Sign out</button></section></main>;

    return <WorkspaceShell key={session.user.id} user={session.user} onSignOut={() => void signOut({ callbackUrl: '/' })}>
        {session.user.role && <VeoTelegramReminder username={session.user.telegramUsername} />}
        <Suspense fallback={<p role="status">Opening workspace…</p>}><SunoEarningsPolicyGate>{children}</SunoEarningsPolicyGate></Suspense>
    </WorkspaceShell>;
}
