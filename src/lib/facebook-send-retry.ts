/** Retry explicit temporary Graph rejections, never ambiguous network failures. */
export function isRetryableFacebookSendError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const graphError = error as { code?: number; raw?: { error?: { is_transient?: boolean } }; message?: string };
    if ([10, 100, 190, 200, 551].includes(graphError.code || 0)) return false;
    return graphError.code === 1 || graphError.code === 2 ||
        graphError.raw?.error?.is_transient === true ||
        /^\(#(?:1|2)\)\s/.test(graphError.message || '');
}

export async function retryFacebookSend<T>(send: () => Promise<T>, beforeRetry?: () => Promise<void>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
        if (attempt > 0 && beforeRetry) await beforeRetry();
        try {
            return await send();
        } catch (error) {
            if (attempt >= 2 || !isRetryableFacebookSendError(error)) throw error;
            await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 500 : 1500));
        }
    }
}
