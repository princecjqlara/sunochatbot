import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspacePreview from '@/components/WorkspacePreview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'SUNO Workspace preview', robots: { index: false, follow: false } };

export default function WorkspacePreviewPage() {
    if (process.env.NODE_ENV !== 'development' && process.env.SUNO_DEPLOYMENT_STAGE !== 'setup') notFound();
    return <Suspense fallback={<p role="status" className="p-8">Loading workspace preview…</p>}><WorkspacePreview /></Suspense>;
}
