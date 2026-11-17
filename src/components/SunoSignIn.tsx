'use client';

import React, { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Facebook, MessageCircle } from 'lucide-react';
import { FACEBOOK_PERMISSION_SCOPE } from '@/lib/facebook-permissions';

function signInMessage(code: string | null | undefined) {
    if (code === 'CredentialsSignin') return 'The email or password was not recognized. Please try again.';
    if (code === 'TooManyAttempts') return 'Too many sign-in attempts. Please try again in 10 minutes.';
    if (code === 'SignInUnavailable') return 'Sign-in is temporarily unavailable. Please try again shortly.';
    return 'We could not sign you in. Please try again.';
}

export default function SunoSignIn() {
    const { status, data: session } = useSession();
    const router = useRouter(), params = useSearchParams();
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => { if (status === 'authenticated' && session?.user) router.replace('/dashboard'); }, [status, session?.user, router]);

    return <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10 text-slate-900">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
            <div className="mb-8 flex items-center gap-3"><span className="rounded-xl bg-slate-900 p-3 text-white"><MessageCircle aria-hidden="true" className="h-6 w-6" /></span><div><p className="text-lg font-bold tracking-tight">SUNO</p><p className="text-xs text-slate-500">Sunochatbot workspace</p></div></div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="mb-7 mt-3 text-sm leading-6 text-slate-500">Sign in to manage your connected Pages, contacts and messaging.</p>
            <form className="space-y-5" aria-busy={busy} onSubmit={async event => {
                event.preventDefault(); setBusy(true); setError('');
                const fields = new FormData(event.currentTarget);
                try {
                    const result = await signIn('credentials', { email: String(fields.get('email') || '').trim(), password: fields.get('password'), redirect: false, callbackUrl: '/dashboard' });
                    if (result?.ok && !result.error) router.replace('/dashboard');
                    else setError(signInMessage(result?.error));
                } catch { setError('The sign-in service could not be reached. Please try again.'); }
                finally { setBusy(false); }
            }}>
                <label className="block text-sm font-medium">Email<input name="email" type="email" autoComplete="username" placeholder="you@example.com" maxLength={254} required className="input-wireframe mt-2 h-12" /></label>
                <label className="block text-sm font-medium">Password<input name="password" type="password" autoComplete="current-password" maxLength={1024} required className="input-wireframe mt-2 h-12" /></label>
                <button type="submit" disabled={busy || status === 'loading'} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 p-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
            </form>
            {(error || params.get('error')) && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{error || signInMessage(params.get('error'))}</p>}
            <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
            <button type="button" disabled={busy} onClick={() => void signIn('facebook', { callbackUrl: '/dashboard' }, { auth_type: 'rerequest', scope: FACEBOOK_PERMISSION_SCOPE })} className="btn-wireframe w-full"><Facebook aria-hidden="true" className="h-4 w-4" />Continue with Facebook</button>
            <p className="mt-7 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">Your connected Pages and saved chatbot settings stay with your account.</p>
        </section>
    </main>;
}
