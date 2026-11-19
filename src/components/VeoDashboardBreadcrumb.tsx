'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { dashboardLocation } from '@/lib/suno-navigation';
import { workspacePreviewTarget } from '@/lib/workspace-preview';

export default function VeoDashboardBreadcrumb({ role, preview = false }: { role?: string; preview?: boolean }) {
    const pathname = usePathname(), search = useSearchParams();
    const target = preview ? workspacePreviewTarget(search.get('page')) : null;
    const location = dashboardLocation(role, target?.pathname || pathname, target?.searchParams || search);
    return <div aria-label="Current location" className="flex min-w-0 items-center gap-2 text-sm">
        <span className="hidden text-slate-400 sm:inline">{location.group}</span>
        <ChevronRight aria-hidden="true" className="hidden h-3.5 w-3.5 shrink-0 text-slate-300 sm:block" />
        <span className="truncate font-medium text-slate-700">{location.label}</span>
    </div>;
}
