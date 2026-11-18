import aliases from '@/config/suno-runtime-aliases.json';

/** Only the management client's requests use upgraded implementations. */
export function sunoWorkspaceEndpoint(input: RequestInfo | URL, enabled = process.env.SUNO_RETAINED_RUNTIME_ENABLED === 'true'): RequestInfo | URL {
    if (!enabled) return input;
    const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(value);
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
    const relation = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
    const mapped = rpc ? (aliases.rpc as Record<string,string>)[rpc[1]] : relation ? (aliases.relations as Record<string,string>)[relation[1]] : undefined;
    if (!mapped) return input;
    url.pathname = rpc ? '/rest/v1/rpc/' + mapped : '/rest/v1/' + mapped;
    return typeof input === 'string' ? url.href : input instanceof URL ? url : new Request(url,input);
}
