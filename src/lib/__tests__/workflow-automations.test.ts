import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sendMessage: vi.fn(),
    sendMessengerMediaAttachment: vi.fn(),
    getConversationForPsid: vi.fn(),
    getMessengerContactLabels: vi.fn()
}));

vi.mock('../facebook', () => ({
    sendMessage: mocks.sendMessage,
    sendMessengerMediaAttachment: mocks.sendMessengerMediaAttachment,
    getConversationForPsid: mocks.getConversationForPsid,
    getMessengerContactLabels: mocks.getMessengerContactLabels
}));

import {
    handleFollowUpWorkflowContactReply,
    normalizeWorkflowKeyword,
    processDueFollowUpAutomationSteps,
    stopWorkflowAutomationsFromPageMessage,
    workflowTextMatchesCode
} from '../workflow-automations';

function createWorkflowSupabaseMock(options?: {
    automations?: Array<Record<string, unknown>>;
    states?: Array<Record<string, unknown>>;
    contact?: Record<string, unknown> | null;
    chatbotState?: Record<string, unknown> | null;
    contactError?: { message: string };
}) {
    const stateUpserts: Record<string, unknown>[] = [];
    const stateUpdates: Record<string, unknown>[] = [];

    const from = vi.fn((table: string) => {
        if (table === 'workflow_automations') {
            const automationResult = {
                data: options?.automations || [],
                error: null
            };
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            order: vi.fn().mockResolvedValue(automationResult),
                            not: vi.fn().mockResolvedValue(automationResult)
                        }),
                        not: vi.fn().mockResolvedValue(automationResult)
                    })
                })
            };
        }

        if (table === 'workflow_automation_states') {
            const stateRows = options?.states || [];
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({
                            data: stateRows,
                            error: null
                        }),
                        lte: vi.fn().mockReturnValue({
                            order: vi.fn().mockReturnValue({
                                limit: vi.fn().mockResolvedValue({
                                    data: stateRows,
                                    error: null
                                })
                            })
                        })
                    })
                }),
                upsert: vi.fn((payload) => {
                    stateUpserts.push(payload);
                    return Promise.resolve({ error: null });
                }),
                update: vi.fn((payload) => {
                    stateUpdates.push(payload);
                    return {
                        eq: vi.fn().mockResolvedValue({ error: null })
                    };
                })
            };
        }

        if (table === 'contacts') {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: options?.contact ?? { id: 'contact_1' },
                                error: options?.contactError || null
                            })
                        })
                    })
                })
            };
        }

        if (table === 'chatbot_contact_states') {
            const chain: any = { select: () => chain, eq: () => chain,
                maybeSingle: async () => ({ data: options?.chatbotState || null, error: null }) };
            return chain;
        }
        if (table === 'outbound_message_events') return { upsert: vi.fn().mockResolvedValue({ error: null }) };

        throw new Error(`Unexpected table: ${table}`);
    });

    return { supabase: { from }, stateUpserts, stateUpdates };
}

const automation = {
    id: 'automation_1',
    page_id: 'page_1',
    name: 'Follow-up automation',
    enabled: true,
    trigger_type: 'follow_up',
    message_text: 'Hi {{first_name}}',
    steps: [
        { message_text: 'Hi {{first_name}} step 1', delay_minutes: 30 },
        { message_text: 'Hi {{first_name}} step 2', delay_minutes: 60 }
    ],
    reply_action: 'reset',
    page_stop_code: '#stopauto',
    cooldown_minutes: 30
};

describe('workflow automations', () => {
    beforeEach(() => {
        mocks.sendMessage.mockReset();
        mocks.sendMessengerMediaAttachment.mockReset();
        mocks.sendMessage.mockResolvedValue({ message_id: 'mid_1' });
        mocks.sendMessengerMediaAttachment.mockResolvedValue({ message_id: 'mid_media_1' });
        mocks.getConversationForPsid.mockReset();
        mocks.getMessengerContactLabels.mockReset().mockResolvedValue([]);
        mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [] } });
    });

    it('normalizes codes before matching', () => {
        expect(normalizeWorkflowKeyword('  #StopAuto   Now  ')).toBe('#stopauto now');
        expect(workflowTextMatchesCode(' #STOPAUTO ', '#stopauto')).toBe(true);
        expect(workflowTextMatchesCode('please #stopauto', '#stopauto')).toBe(false);
    });

    function dueState() {
        return { id: 'state_1', automation_id: 'automation_1', contact_id: 'contact_1', status: 'active',
            current_step_index: 0, next_step_at: '2026-07-29T02:30:00.000Z',
            workflow_automations: { ...automation, steps: [{ message_text: 'Here is the information.', delay_minutes: 30,
                media_type: 'image', media_url: 'https://example.test/image.jpg' }],
                pages: { fb_page_id: 'fb_page_1', access_token: 'token_1' } },
            contacts: { id: 'contact_1', page_id: 'page_1', psid: 'psid_1', last_interaction_at: '2026-07-29T02:00:00.000Z' } };
    }
    const setStage = (stage: string) => mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [{
        id: 'stage', message: `Lead stage set to ${stage}`, from: { id: 'fb_page_1' }, created_time: '2026-07-29T02:20:00Z'
    }] } });
    it.each(['Qualified', 'Converted', 'Contacted', 'Interested', 'Custom stage'])('stops a due workflow for Facebook stage %s', async stage => {
        const { supabase, stateUpdates } = createWorkflowSupabaseMock({ states: [dueState()] });
        setStage(stage);
        const result = await processDueFollowUpAutomationSteps({ supabase, now: new Date('2026-07-29T02:30:00Z') });
        expect(result.stopped).toBe(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(mocks.sendMessengerMediaAttachment).not.toHaveBeenCalled();
        expect(stateUpdates).toContainEqual(expect.objectContaining({ status: 'stopped' }));
    });
    it('allows an eligible Intake workflow', async () => {
        const { supabase } = createWorkflowSupabaseMock({ states: [dueState()] });
        setStage('Intake');
        expect((await processDueFollowUpAutomationSteps({ supabase, now: new Date('2026-07-29T02:30:00Z') })).sent).toBe(1);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });
    it('blocks a current Qualified label even when the workflow has no stage history event', async () => {
        const { supabase } = createWorkflowSupabaseMock({ states: [dueState()] });
        mocks.getMessengerContactLabels.mockResolvedValue([{ id: 'q', page_label_name: 'Qualified' }]);
        expect((await processDueFollowUpAutomationSteps({ supabase, now: new Date('2026-07-29T02:30:00Z') })).stopped).toBe(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(mocks.sendMessengerMediaAttachment).not.toHaveBeenCalled();
    });
    it('does not send a workflow when current label access is denied', async () => {
        const { supabase } = createWorkflowSupabaseMock({ states: [dueState()] });
        mocks.getMessengerContactLabels.mockRejectedValue(new Error('Label access denied'));
        expect((await processDueFollowUpAutomationSteps({ supabase, now: new Date('2026-07-29T02:30:00Z') })).errors).toBe(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(mocks.sendMessengerMediaAttachment).not.toHaveBeenCalled();
    });
    it('stops workflow media when the stage changes after text was delivered', async () => {
        const { supabase } = createWorkflowSupabaseMock({ states: [dueState()] });
        mocks.sendMessage.mockImplementation(async () => { setStage('Interested'); return { message_id: 'text' }; });
        expect((await processDueFollowUpAutomationSteps({ supabase, now: new Date('2026-07-29T02:30:00Z') })).stopped).toBe(1);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        expect(mocks.sendMessengerMediaAttachment).not.toHaveBeenCalled();
    });
    it('blocks a workflow retry after a lead stage change', async () => {
        const { supabase } = createWorkflowSupabaseMock({ states: [dueState()] });
        mocks.sendMessage.mockImplementation(async (...args) => { setStage('Contacted'); await args[10](); });
        expect((await processDueFollowUpAutomationSteps({ supabase, now: new Date('2026-07-29T02:30:00Z') })).stopped).toBe(1);
        expect(mocks.sendMessengerMediaAttachment).not.toHaveBeenCalled();
    });
    it('sends nothing when lead-stage verification fails', async () => {
        const { supabase } = createWorkflowSupabaseMock({ states: [dueState()] });
        mocks.getConversationForPsid.mockRejectedValue(new Error('Facebook unavailable'));
        expect((await processDueFollowUpAutomationSteps({ supabase, now: new Date('2026-07-29T02:30:00Z') })).errors).toBe(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(mocks.sendMessengerMediaAttachment).not.toHaveBeenCalled();
    });

    it('resets a follow-up sequence to step 1 when configured to reset on contact reply', async () => {
        const { supabase, stateUpserts } = createWorkflowSupabaseMock({
            automations: [automation],
            states: [{ automation_id: 'automation_1', status: 'active', current_step_index: 1 }]
        });

        const result = await handleFollowUpWorkflowContactReply({
            supabase,
            page: {
                id: 'page_1',
                fb_page_id: 'fb_page_1',
                access_token: 'token_1'
            },
            contact: {
                id: 'contact_1',
                page_id: 'page_1',
                psid: 'psid_1',
                name: 'Juan Dela Cruz',
                last_interaction_at: '2026-07-29T02:00:00.000Z'
            },
            messageText: 'hello',
            interactionAt: '2026-07-29T02:00:00.000Z',
            now: new Date('2026-07-29T02:00:00.000Z')
        });

        expect(result.reset).toBe(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(stateUpserts[0]).toMatchObject({
            automation_id: 'automation_1',
            contact_id: 'contact_1',
            status: 'active',
            current_step_index: 0,
            next_step_at: '2026-07-29T02:30:00.000Z'
        });
    });

    it('schedules step 1 for a new contact even when later replies should stop the workflow', async () => {
        const { supabase, stateUpserts } = createWorkflowSupabaseMock({
            automations: [{ ...automation, reply_action: 'stop' }],
            states: []
        });

        const result = await handleFollowUpWorkflowContactReply({
            supabase,
            page: {
                id: 'page_1',
                fb_page_id: 'fb_page_1',
                access_token: 'token_1'
            },
            contact: {
                id: 'contact_1',
                page_id: 'page_1',
                psid: 'psid_1',
                name: 'Juan Dela Cruz',
                last_interaction_at: '2026-07-29T02:00:00.000Z'
            },
            messageText: 'anything',
            interactionAt: '2026-07-29T02:00:00.000Z',
            now: new Date('2026-07-29T02:00:00.000Z')
        });

        expect(result.scheduled).toBe(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(stateUpserts[0]).toMatchObject({
            status: 'active',
            current_step_index: 0,
            next_step_at: '2026-07-29T02:30:00.000Z'
        });
    });

    it('stops an active follow-up sequence when configured to stop on contact reply', async () => {
        const { supabase, stateUpserts } = createWorkflowSupabaseMock({
            automations: [{ ...automation, reply_action: 'stop' }],
            states: [{ automation_id: 'automation_1', status: 'active', current_step_index: 0 }]
        });

        const result = await handleFollowUpWorkflowContactReply({
            supabase,
            page: { id: 'page_1', fb_page_id: 'fb_page_1', access_token: 'token_1' },
            contact: {
                id: 'contact_1',
                page_id: 'page_1',
                psid: 'psid_1',
                name: 'Juan Dela Cruz',
                last_interaction_at: '2026-07-29T02:00:00.000Z'
            },
            messageText: 'anything',
            interactionAt: '2026-07-29T02:00:00.000Z',
            now: new Date('2026-07-29T02:00:00.000Z')
        });

        expect(result.stopped).toBe(1);
        expect(stateUpserts[0]).toMatchObject({
            status: 'stopped',
            stopped_reason: 'contact_reply',
            next_step_at: null
        });
    });

    it('ignores a replayed contact webhook instead of resetting the timer', async () => {
        const { supabase, stateUpserts } = createWorkflowSupabaseMock({
            automations: [automation],
            states: [{
                automation_id: 'automation_1',
                status: 'active',
                current_step_index: 0,
                last_contact_reply_at: '2026-07-29T02:00:00.000Z'
            }]
        });

        const result = await handleFollowUpWorkflowContactReply({
            supabase,
            page: { id: 'page_1', fb_page_id: 'fb_page_1', access_token: 'token_1' },
            contact: {
                id: 'contact_1',
                page_id: 'page_1',
                psid: 'psid_1',
                name: null,
                last_interaction_at: '2026-07-29T02:00:00.000Z'
            },
            messageText: 'duplicate delivery',
            interactionAt: '2026-07-29T02:00:00.000Z',
            now: new Date('2026-07-29T02:00:05.000Z')
        });

        expect(result.skipped).toBe(1);
        expect(stateUpserts).toHaveLength(0);
    });

    it('restarts a workflow after a fresh reply reopens the standard reply window', async () => {
        const { supabase, stateUpserts } = createWorkflowSupabaseMock({
            automations: [{ ...automation, reply_action: 'stop' }],
            states: [{
                automation_id: 'automation_1',
                status: 'stopped',
                stopped_reason: 'outside_standard_reply_window',
                current_step_index: 0,
                last_contact_reply_at: '2026-07-20T02:00:00.000Z'
            }]
        });

        const result = await handleFollowUpWorkflowContactReply({
            supabase,
            page: { id: 'page_1', fb_page_id: 'fb_page_1', access_token: 'token_1' },
            contact: {
                id: 'contact_1',
                page_id: 'page_1',
                psid: 'psid_1',
                name: null,
                last_interaction_at: '2026-07-29T02:00:00.000Z'
            },
            messageText: 'new reply',
            interactionAt: '2026-07-29T02:00:00.000Z',
            now: new Date('2026-07-29T02:00:00.000Z')
        });

        expect(result.scheduled).toBe(1);
        expect(stateUpserts[0]).toMatchObject({
            status: 'active',
            current_step_index: 0,
            next_step_at: '2026-07-29T02:30:00.000Z'
        });
    });

    it('sends a due follow-up step and schedules the next interval', async () => {
        const { supabase, stateUpdates } = createWorkflowSupabaseMock({
            states: [{
                id: 'state_1',
                automation_id: 'automation_1',
                contact_id: 'contact_1',
                status: 'active',
                current_step_index: 0,
                next_step_at: '2026-07-29T02:30:00.000Z',
                workflow_automations: {
                    ...automation,
                    pages: { fb_page_id: 'fb_page_1', access_token: 'token_1' }
                },
                contacts: {
                    id: 'contact_1',
                    page_id: 'page_1',
                    psid: 'psid_1',
                    name: 'Juan Dela Cruz',
                    last_interaction_at: '2026-07-29T02:00:00.000Z'
                }
            }]
        });

        const result = await processDueFollowUpAutomationSteps({
            supabase,
            now: new Date('2026-07-29T02:30:00.000Z')
        });

        expect(result.sent).toBe(1);
        expect(mocks.sendMessage).toHaveBeenCalledWith(
            'fb_page_1',
            'token_1',
            'psid_1',
            'Hi Juan step 1',
            'RESPONSE', undefined, undefined, undefined, undefined, undefined, expect.any(Function)
        );
        expect(stateUpdates[0]).toMatchObject({
            status: 'active',
            current_step_index: 1,
            next_step_at: '2026-07-29T03:30:00.000Z'
        });
    });

    it('sends follow-up step media as a standard response attachment after text', async () => {
        const { supabase, stateUpdates } = createWorkflowSupabaseMock({
            states: [{
                id: 'state_1',
                automation_id: 'automation_1',
                contact_id: 'contact_1',
                status: 'active',
                current_step_index: 0,
                next_step_at: '2026-07-29T02:30:00.000Z',
                workflow_automations: {
                    ...automation,
                    steps: [{
                        message_text: 'Hi {{first_name}}, here is the video.',
                        delay_minutes: 30,
                        media_type: 'video',
                        media_url: 'https://example.com/{{first_name}}-tour.mp4'
                    }],
                    pages: { fb_page_id: 'fb_page_1', access_token: 'token_1' }
                },
                contacts: {
                    id: 'contact_1',
                    page_id: 'page_1',
                    psid: 'psid_1',
                    name: 'Juan Dela Cruz',
                    last_interaction_at: '2026-07-29T02:00:00.000Z'
                }
            }]
        });

        const result = await processDueFollowUpAutomationSteps({
            supabase,
            now: new Date('2026-07-29T02:30:00.000Z')
        });

        expect(result.sent).toBe(1);
        expect(mocks.sendMessage).toHaveBeenCalledWith(
            'fb_page_1',
            'token_1',
            'psid_1',
            'Hi Juan, here is the video.',
            'RESPONSE', undefined, undefined, undefined, undefined, undefined, expect.any(Function)
        );
        expect(mocks.sendMessengerMediaAttachment).toHaveBeenCalledWith(
            'fb_page_1',
            'token_1',
            'psid_1',
            {
                type: 'video',
                url: 'https://example.com/Juan-tour.mp4'
            },
            'RESPONSE'
        );
        expect(stateUpdates[0]).toMatchObject({
            status: 'completed',
            current_step_index: 1
        });
    });

    it('allows a media-only follow-up step', async () => {
        const { supabase } = createWorkflowSupabaseMock({
            states: [{
                id: 'state_1',
                automation_id: 'automation_1',
                contact_id: 'contact_1',
                status: 'active',
                current_step_index: 0,
                next_step_at: '2026-07-29T02:30:00.000Z',
                workflow_automations: {
                    ...automation,
                    steps: [{
                        message_text: '',
                        delay_minutes: 30,
                        media_type: 'image',
                        media_url: 'https://example.com/photo.jpg'
                    }],
                    pages: { fb_page_id: 'fb_page_1', access_token: 'token_1' }
                },
                contacts: {
                    id: 'contact_1',
                    page_id: 'page_1',
                    psid: 'psid_1',
                    name: 'Juan Dela Cruz',
                    last_interaction_at: '2026-07-29T02:00:00.000Z'
                }
            }]
        });

        const result = await processDueFollowUpAutomationSteps({
            supabase,
            now: new Date('2026-07-29T02:30:00.000Z')
        });

        expect(result.sent).toBe(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(mocks.sendMessengerMediaAttachment).toHaveBeenCalledWith(
            'fb_page_1',
            'token_1',
            'psid_1',
            {
                type: 'image',
                url: 'https://example.com/photo.jpg'
            },
            'RESPONSE'
        );
    });

    it('stops automation for a contact when a page message exactly matches the stop code', async () => {
        const { supabase, stateUpserts } = createWorkflowSupabaseMock({
            automations: [automation],
            contact: { id: 'contact_1' }
        });

        const result = await stopWorkflowAutomationsFromPageMessage({
            supabase,
            pageId: 'page_1',
            contactPsid: 'psid_1',
            messageText: ' #STOPAUTO ',
            now: new Date('2026-07-29T02:00:00.000Z')
        });

        expect(result.stopped).toBe(1);
        expect(stateUpserts[0]).toMatchObject({
            automation_id: 'automation_1',
            contact_id: 'contact_1',
            status: 'stopped',
            stopped_reason: 'page_stop_code'
        });
    });
});
