type NavigationIcon = 'home' | 'people' | 'pipeline' | 'tag' | 'message' | 'file' | 'download' | 'history' | 'bot' | 'settings';
export type SunoNavigationItem = { href: string; label: string; icon: NavigationIcon };
export const sunoNavigation: { name: string; items: SunoNavigationItem[] }[] = [
    { name: 'Work', items: [
        { href: '/dashboard', label: 'Dashboard', icon: 'home' },
        { href: '/dashboard/contacts', label: 'Contacts', icon: 'people' },
        { href: '/dashboard/pipeline', label: 'Pipeline', icon: 'pipeline' },
        { href: '/dashboard/7-day-contacts', label: '7-day contacts', icon: 'history' },
        { href: '/dashboard/tags', label: 'Contact tags', icon: 'tag' }
    ] },
    { name: 'Messaging', items: [
        { href: '/dashboard/campaigns', label: 'Campaigns', icon: 'message' },
        { href: '/dashboard/automations', label: 'Follow-ups', icon: 'message' },
        { href: '/dashboard/templates', label: 'Templates', icon: 'file' },
        { href: '/dashboard/welcome', label: 'Welcome message', icon: 'message' }
    ] },
    { name: 'Tools & settings', items: [
        { href: '/dashboard/connect', label: 'Pages & connections', icon: 'settings' },
        { href: '/dashboard/chatbot', label: 'AI chatbot', icon: 'bot' },
        { href: '/dashboard/history', label: 'History', icon: 'history' },
        { href: '/dashboard/exports', label: 'Exports', icon: 'download' },
        { href: '/dashboard/settings', label: 'Settings', icon: 'settings' }
    ] }
];

export function activeSunoItem(href: string, pathname: string) {
    return href === pathname || href !== '/dashboard' && pathname.startsWith(href + '/');
}

export function sunoLocation(pathname: string) {
    for (const group of sunoNavigation) {
        const item = group.items.find(candidate => activeSunoItem(candidate.href, pathname));
        if (item) return { group: group.name, label: item.label };
    }
    return { group: 'Workspace', label: 'Dashboard' };
}
