import { describe, expect, it } from 'vitest';
import {
    isPipelineClosedForAutomation,
    pipelineStageForChatbotProgress,
    pipelineStageForMessengerSignal,
    shouldAutoMovePipeline,
    updateContactPipelineStage
} from '@/legacy-runtime/lib/contact-pipeline';

describe('contact pipeline', () => {
    it('maps bot progress to the appropriate stage', () => {
        expect(pipelineStageForChatbotProgress({})).toBe('engaged');
        expect(pipelineStageForChatbotProgress({ collectedDetails: { email: 'a@example.com' } })).toBe('collecting_details');
        expect(pipelineStageForChatbotProgress({ detailsComplete: true })).toBe('qualified');
        expect(pipelineStageForChatbotProgress({ stopReason: 'refusal' })).toBe('not_qualified');
        expect(pipelineStageForChatbotProgress({ stopReason: 'opt_out' })).toBe('opted_out');
    });

    it('maps all Messenger lead-stage signals directly', () => {
        expect(pipelineStageForMessengerSignal('qualified')).toBe('qualified');
        expect(pipelineStageForMessengerSignal('order_created')).toBe('order_created');
        expect(pipelineStageForMessengerSignal('converted')).toBe('converted');
        expect(pipelineStageForMessengerSignal('not_qualified')).toBe('not_qualified');
    });

    it('moves forward automatically without regressing successful contacts', () => {
        expect(shouldAutoMovePipeline('new', 'engaged')).toBe(true);
        expect(shouldAutoMovePipeline('qualified', 'collecting_details')).toBe(false);
        expect(shouldAutoMovePipeline('order_created', 'not_qualified')).toBe(false);
        expect(shouldAutoMovePipeline('not_qualified', 'qualified')).toBe(true);
        expect(shouldAutoMovePipeline('converted', 'qualified')).toBe(false);
        expect(shouldAutoMovePipeline('engaged', 'opted_out')).toBe(true);
    });

    it('closes completed and terminal stages to bot automation', () => {
        expect(isPipelineClosedForAutomation('new')).toBe(false);
        expect(isPipelineClosedForAutomation('engaged')).toBe(false);
        expect(isPipelineClosedForAutomation('collecting_details')).toBe(false);
        expect(isPipelineClosedForAutomation('qualified')).toBe(true);
        expect(isPipelineClosedForAutomation('order_created')).toBe(true);
        expect(isPipelineClosedForAutomation('converted')).toBe(true);
        expect(isPipelineClosedForAutomation('not_qualified')).toBe(true);
        expect(isPipelineClosedForAutomation('opted_out')).toBe(true);
    });
});

describe('pipeline write concurrency', () => {
    function database(initial: Record<string, unknown>, beforeUpdate?: (row: Record<string, unknown>) => void) {
        const row: Record<string, unknown> = { id: 'contact', page_id: 'page', pipeline_stage_source: 'chatbot',
            pipeline_stage_updated_at: '2026-10-17T05:00:00.000Z', ...initial };
        const db = { from: () => {
            let payload: Record<string, unknown> | null = null;
            const filters: Array<[string, unknown]> = [];
            const q: any = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
                update: (value: Record<string, unknown>) => { payload = value; beforeUpdate?.(row); return q; },
                maybeSingle: async () => {
                    if (!filters.every(([key, value]) => row[key] === value)) return { data: null, error: null };
                    if (payload) Object.assign(row, payload);
                    return { data: { ...row }, error: null };
                } };
            return q;
        } };
        return { db, row };
    }
    it('does not overwrite a staff close that arrives between the read and write', async () => {
        const { db, row } = database({ pipeline_stage: 'engaged' }, row => Object.assign(row, {
            pipeline_stage: 'qualified', pipeline_stage_source: 'manual', pipeline_stage_updated_at: '2026-10-17T06:00:00.000Z' }));
        expect(await updateContactPipelineStage(db, { pageId: 'page', contactId: 'contact', stage: 'collecting_details', source: 'chatbot' })).toBe(false);
        expect(row.pipeline_stage).toBe('qualified');
        expect(row.pipeline_stage_source).toBe('manual');
    });
    it('records a Messenger qualification even when the bot already chose the same stage', async () => {
        const { db, row } = database({ pipeline_stage: 'qualified' });
        expect(await updateContactPipelineStage(db, { pageId: 'page', contactId: 'contact', stage: 'qualified', source: 'messenger' })).toBe(true);
        expect(row.pipeline_stage_source).toBe('messenger');
    });
    it.each(['qualified', 'not_qualified', 'converted', 'order_created', 'opted_out'])('does not let an older bot turn change the closed %s stage', async stage => {
        const { db, row } = database({ pipeline_stage: stage, pipeline_stage_source: 'manual' });
        expect(await updateContactPipelineStage(db, { pageId: 'page', contactId: 'contact', stage: 'qualified', source: 'chatbot' })).toBe(false);
        expect(row.pipeline_stage).toBe(stage);
    });
});
