import { Suspense } from 'react';
import VeoSignIn from '@/components/VeoSignIn';
export default function HomePage() {
    return <Suspense fallback={<p>Loading SUNO...</p>}><VeoSignIn /></Suspense>;
}
