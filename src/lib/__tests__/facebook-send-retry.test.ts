import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryFacebookSend } from '../facebook-send-retry';

afterEach(() => { vi.useRealTimers(); });

describe('Facebook retry eligibility', () => {
    it('cancels a transient resend when a human takes over during the retry delay', async () => {
        vi.useFakeTimers();
        const send = vi.fn().mockRejectedValue({ code: 2 });
        const guard = vi.fn().mockRejectedValue(new Error('Human took over'));
        const result = retryFacebookSend(send, guard);
        const rejection = expect(result).rejects.toThrow('Human took over');
        await vi.advanceTimersByTimeAsync(500);
        await rejection;
        expect(send).toHaveBeenCalledTimes(1);
        expect(guard).toHaveBeenCalledTimes(1);
    });

    it('rechecks eligibility before each explicit transient retry', async () => {
        vi.useFakeTimers();
        const send = vi.fn().mockRejectedValueOnce({ code: 2 }).mockResolvedValue({ message_id: 'sent' });
        const guard = vi.fn().mockResolvedValue(undefined);
        const result = retryFacebookSend(send, guard);
        await vi.advanceTimersByTimeAsync(500);
        await expect(result).resolves.toEqual({ message_id: 'sent' });
        expect(send).toHaveBeenCalledTimes(2);
        expect(guard).toHaveBeenCalledTimes(1);
    });
});
