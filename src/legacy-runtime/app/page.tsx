import React, { Suspense } from 'react';
import SunoSignIn from '@/legacy-runtime/components/SunoSignIn';

export default function HomePage() {
    return <Suspense fallback={<p role="status" className="p-8">Loading Sunochatbot…</p>}><SunoSignIn /></Suspense>;
}
