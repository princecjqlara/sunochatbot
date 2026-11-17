import { dashboardNavigation } from './veo-navigation';

export function workspacePreviewTarget(value: string | null) {
    const allowed = dashboardNavigation('owner').some(group => group.items.some(item => item.href === value));
    return new URL(allowed && value ? value : '/dashboard/workspace', 'https://preview.invalid');
}

export const workspacePreviewHref = (href: string) => '/ui-preview?page=' + encodeURIComponent(href);
