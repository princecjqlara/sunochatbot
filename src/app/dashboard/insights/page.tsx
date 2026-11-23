import {Suspense} from 'react';
import SunoOperationsReport from '@/components/SunoOperationsReport';
export default function InsightsPage(){return <Suspense fallback={<p>Opening Business Insights…</p>}><SunoOperationsReport view="insights" /></Suspense>;}
