import { describe, expect, it, vi } from 'vitest';
import { recordContactBestTime } from '@/lib/contact-best-time';

function mockDb(hours: number[], readError: { message: string } | null = null) {
    const insert = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const filters: any = { eq: vi.fn(() => filters), then: (resolve: any) => resolve({ data: hours.map(hour_of_day => ({ hour_of_day })), error: readError }) };
    return { insert, update, filters, from: (table: string) => table === 'contacts' ? { update } : { insert, select: () => filters } };
}

describe('contact best-time learning', () => {
    it('records Philippine inbound hours and retains a more frequent historical hour', async () => {
        const db = mockDb([14,14,14,20]);
        await expect(recordContactBestTime({ supabase: db, pageId: 'page', contactId: 'contact', interactionTime: new Date('2026-10-10T12:00:00Z') })).resolves.toBe(14);
        expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ hour_of_day: 20, is_from_contact: true }));
        expect(db.filters.eq).toHaveBeenCalledWith('is_from_contact', true);
        expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ best_contact_hour: 14, best_contact_hours: [{ hour: 14, count: 3 }, { hour: 20, count: 1 }] }));
    });
    it('uses the latest customer hour to break a frequency tie', async () => {
        const db = mockDb([14,20]);
        await expect(recordContactBestTime({ supabase: db, pageId: 'page', contactId: 'contact', interactionTime: new Date('2026-10-10T12:00:00Z') })).resolves.toBe(20);
    });
    it('does not overwrite learned timing after an activity read failure', async () => {
        const db = mockDb([], { message: 'Temporary read failure' });
        await expect(recordContactBestTime({ supabase: db, pageId: 'page', contactId: 'contact', interactionTime: new Date('2026-10-10T12:00:00Z') })).rejects.toThrow('Temporary read failure');
        expect(db.update).not.toHaveBeenCalled();
    });
});
