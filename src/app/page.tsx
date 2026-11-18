import { Suspense } from 'react';
import Link from 'next/link';
import VeoSignIn from '@/components/VeoSignIn';
export default function HomePage() {
    if (process.env.SUNO_DEPLOYMENT_STAGE === 'setup') return <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10 text-slate-900"><section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><p className="text-sm font-bold tracking-widest text-slate-500">SUNO WORKSPACE</p><h1 className="mt-4 text-3xl font-bold">Setup is in progress</h1><p role="status" className="mt-4 leading-7 text-slate-600">The new workspace has been deployed. Account migration and the bot connection still need to be completed before sign-in opens.</p><p className="mt-5 text-sm leading-6 text-slate-500">Calendars, customer profiles, song workflows and team tools will become available after setup is verified.</p><Link href="/ui-preview" className="btn-wireframe-dark mt-6">Preview workspace UI</Link></section></main>;
    return <Suspense fallback={<p>Loading SUNO...</p>}><VeoSignIn /></Suspense>;
}
