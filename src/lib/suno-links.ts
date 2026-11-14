const inheritedOrigin = 'https://veochatbot.vercel.app';

/** Telegram links use the deployed Suno origin, including legacy SQL output. */
export function sunoWorkspaceOrigin(value = process.env.SUNO_WORKSPACE_URL || process.env.NEXTAUTH_URL): string {
    if (!value) throw new Error('Suno workspace HTTPS origin is not configured');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin === inheritedOrigin) {
        throw new Error('Suno workspace HTTPS origin is invalid');
    }
    return url.origin;
}

export function sunoIntakeLinks<T>(value: T, configuredOrigin?: string): T {
    const visit = (item: any): any => {
        if (Array.isArray(item)) return item.map(visit);
        if (!item || typeof item !== 'object') return item;
        return Object.fromEntries(Object.entries(item).map(([key, entry]) => {
            if (key !== 'url' || typeof entry !== 'string') return [key, visit(entry)];
            const origin = configuredOrigin || sunoWorkspaceOrigin();
            const link = new URL(entry);
            if (![inheritedOrigin, origin].includes(link.origin) || !link.pathname.startsWith('/dashboard/') || link.username || link.password) {
                throw new Error('Assignment link is outside the Suno workspace');
            }
            return [key, origin + link.pathname + link.search];
        }));
    };
    return visit(value);
}
