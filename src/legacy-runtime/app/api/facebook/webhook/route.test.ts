import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    getSupabaseAdmin: vi.fn(),
    verifyWebhookSignature: vi.fn(),
    generateVerifyToken: vi.fn(),
    sendMessage: vi.fn(),
    sendMessengerMediaAttachment: vi.fn(),
    sendMessengerGenericCarousel: vi.fn(),
    getUserProfile: vi.fn(),
    getConversationForPsid: vi.fn(),
    getMessengerContactLabels: vi.fn(),
    analyzeInboundCustomerImages: vi.fn(),
    generateChatbotResponse: vi.fn(),
    loadChatbotDeliveryHistory: vi.fn(), reserveChatbotMessage: vi.fn(), finishChatbotMessage: vi.fn(),
    handleFollowUpWorkflowContactReply: vi.fn(),
    triggerReplyWorkflowAutomations: vi.fn(),
    stopWorkflowAutomationsFromPageMessage: vi.fn()
}));

vi.mock('@/legacy-runtime/lib/supabase', () => ({
    getSupabaseAdmin: mocks.getSupabaseAdmin
}));

vi.mock('@/legacy-runtime/lib/facebook', () => ({
    verifyWebhookSignature: mocks.verifyWebhookSignature,
    generateVerifyToken: mocks.generateVerifyToken,
    sendMessage: mocks.sendMessage,
    sendMessengerMediaAttachment: mocks.sendMessengerMediaAttachment,
    sendMessengerGenericCarousel: mocks.sendMessengerGenericCarousel,
    getUserProfile: mocks.getUserProfile,
    getConversationForPsid: mocks.getConversationForPsid,
    getMessengerContactLabels: mocks.getMessengerContactLabels
}));

vi.mock('@/legacy-runtime/lib/placeholders', () => ({
    replaceTemplateVariables: vi.fn((template: string) => template)
}));

vi.mock('@/legacy-runtime/lib/chatbot-media', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/legacy-runtime/lib/chatbot-media')>(),
    analyzeInboundCustomerImages: mocks.analyzeInboundCustomerImages
}));

vi.mock('@/legacy-runtime/lib/chatbot', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/legacy-runtime/lib/chatbot')>(),
    generateChatbotResponse: mocks.generateChatbotResponse
}));

vi.mock('@/legacy-runtime/lib/chatbot-message-delivery', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/legacy-runtime/lib/chatbot-message-delivery')>(),
    loadChatbotDeliveryHistory: mocks.loadChatbotDeliveryHistory,
    reserveChatbotMessage: mocks.reserveChatbotMessage,
    finishChatbotMessage: mocks.finishChatbotMessage
}));

vi.mock('@/legacy-runtime/lib/workflow-automations', () => ({
    handleFollowUpWorkflowContactReply: mocks.handleFollowUpWorkflowContactReply,
    triggerReplyWorkflowAutomations: mocks.triggerReplyWorkflowAutomations,
    stopWorkflowAutomationsFromPageMessage: mocks.stopWorkflowAutomationsFromPageMessage
}));

import { GET, POST } from './route';

function createWebhookVerificationRequest(verifyToken: string): NextRequest {
    const nextUrl = new URL('http://localhost:3000/api/facebook/webhook');
    nextUrl.searchParams.set('hub.mode', 'subscribe');
    nextUrl.searchParams.set('hub.verify_token', verifyToken);
    nextUrl.searchParams.set('hub.challenge', 'facebook-challenge');
    return { nextUrl } as unknown as NextRequest;
}

describe('GET /api/facebook/webhook', () => {
    beforeEach(() => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('FACEBOOK_APP_SECRET', 'app-secret');
        vi.stubEnv('FACEBOOK_CLIENT_ID', '123456789');
        vi.stubEnv('FACEBOOK_WEBHOOK_VERIFY_TOKEN', 'configured-verify-token');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('verifies Meta using the configured environment token', async () => {
        const response = await GET(createWebhookVerificationRequest('configured-verify-token'));

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('facebook-challenge');
    });

    it('rejects the previous hardcoded test token', async () => {
        const response = await GET(createWebhookVerificationRequest('TEST_TOKEN'));

        expect(response.status).toBe(403);
    });

    it('fails clearly when the verify token is missing', async () => {
        vi.stubEnv('FACEBOOK_WEBHOOK_VERIFY_TOKEN', '');
        const response = await GET(createWebhookVerificationRequest('anything'));

        expect(response.status).toBe(500);
    });
});

function createWebhookRequest(payload?: Record<string, unknown>): NextRequest {
    const defaultPayload = {
        object: 'page',
        entry: [
            {
                id: 'fb_page_1',
                messaging: [
                    {
                        sender: { id: 'contact_psid_1' },
                        recipient: { id: 'fb_page_1' },
                        timestamp: 1700000000000,
                        message: { mid: 'mid.1', text: 'hello there' }
                    }
                ]
            }
        ]
    };

    return new Request('http://localhost:3000/api/facebook/webhook', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload ?? defaultPayload)
    }) as unknown as NextRequest;
}

function createSupabaseMock(options?: {
    welcomeConfig?: {
        enabled: boolean;
        message_text: string;
        buttons: Array<{ type: string; text: string; url?: string; payload?: string }>;
    };
    existingContact?: {
        id: string;
        name?: string | null;
        profile_pic?: string | null;
    } | null;
}) {
    const pageSingle = vi.fn().mockResolvedValue({
        data: {
            id: 'page_row_1',
            access_token: 'page_access_token_1'
        },
        error: null
    });
    const pageEq = vi.fn().mockReturnValue({ single: pageSingle });
    const pageSelect = vi.fn().mockReturnValue({ eq: pageEq });

    const existingContactMaybeSingle = vi.fn().mockResolvedValue({
        data: options?.existingContact ?? null,
        error: null
    });
    const existingContactEqPsid = vi.fn().mockReturnValue({ maybeSingle: existingContactMaybeSingle });
    const existingContactEqPage = vi.fn().mockReturnValue({ eq: existingContactEqPsid });
    const contactsSelect = vi.fn((columns: string) => columns === 'pipeline_stage'
        ? { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { pipeline_stage: 'new' }, error: null }) }) }) }
        : { eq: existingContactEqPage });

    const contactsUpsertSingle = vi.fn().mockResolvedValue({
        data: {
            id: 'contact_row_1',
            name: 'Jane Contact'
        },
        error: null
    });
    const contactsUpsertSelect = vi.fn().mockReturnValue({ single: contactsUpsertSingle });
    const contactsUpsert = vi.fn().mockReturnValue({ select: contactsUpsertSelect });

    const contactsUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const contactsUpdate = vi.fn().mockReturnValue({ eq: contactsUpdateEq });

    const welcomeSingle = vi.fn().mockResolvedValue({
        data: options?.welcomeConfig ?? {
            enabled: false,
            message_text: '',
            buttons: []
        },
        error: null
    });
    const welcomeEq = vi.fn().mockReturnValue({ single: welcomeSingle, maybeSingle: welcomeSingle });
    const welcomeSelect = vi.fn().mockReturnValue({ eq: welcomeEq });

    const interactionsInsert = vi.fn().mockResolvedValue({ error: null });
    const interactionsSelectEqFromContact = vi.fn().mockResolvedValue({
        data: [{ hour_of_day: 22 }],
        error: null
    });
    const interactionsSelectEqContact = vi.fn().mockReturnValue({ eq: interactionsSelectEqFromContact });
    const interactionsSelect = vi.fn().mockReturnValue({ eq: interactionsSelectEqContact });

    const from = vi.fn((table: string) => {
        if (table === 'pages') {
            return {
                select: pageSelect
            };
        }

        if (table === 'contacts') {
            return {
                select: contactsSelect,
                upsert: contactsUpsert,
                update: contactsUpdate
            };
        }

        if (table === 'welcome_messages') {
            return {
                select: welcomeSelect
            };
        }

        if (table === 'contact_interactions') {
            return {
                insert: interactionsInsert,
                select: interactionsSelect
            };
        }

        if (table === 'chatbot_configs') {
            return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            }) }) };
        }
        if (table === 'chatbot_contact_states') {
            const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
            return q;
        }
        throw new Error(`Unexpected table: ${table}`);
    });

    return {
        from,
        contactsUpsert
    };
}

function createPhotoChatbotSupabaseMock(options?: { state?: Record<string, unknown>; config?: Record<string, unknown>; latestContact?: Record<string, unknown>; bestContactHour?: number; newContact?: boolean; contact?: Record<string, unknown> }) {
    const welcomeSelect = vi.fn(() => {
        throw new Error('Photo chatbot handling should bypass the welcome lookup');
    });
    const chatbotConfig = {
        page_id: 'page_row_1',
        enabled: true,
        trial_mode_enabled: false,
        trial_contact_id: null as string | null,
        updated_at: '2026-10-08T00:00:00Z',
        instructions: 'Help the customer.',
        fallback_reply: 'A teammate will reply soon.',
        model: 'test-model',
        rag_enabled: false,
        follow_up_prompt: '',
        details_to_collect: [],
        details_completion_percent: 100,
        bot_dos: '',
        bot_donts: '',
        follow_up_enabled: false,
        follow_up_quick_delays_minutes: [],
        follow_up_best_time_days: [],
        follow_up_messages: [],
        follow_up_ai_instructions: 'Keep it personal.',
        follow_up_utility_template_name: 'acct_followup_v1',
        follow_up_utility_template_language: 'en_US',
        follow_up_utility_text: 'Following up',
        follow_up_media_asset_id: null,
        split_messages: false,
        max_message_parts: 1,
        stop_when_details_collected: false,
        stop_on_opt_out: true,
        stop_on_refusal: true,
        stop_on_qualified: true,
        stop_on_not_qualified: true,
        stop_on_converted: true,
        stop_on_order_created: true,
        ...options?.config
    };

    const stateUpsert = vi.fn().mockResolvedValue({ error: null });
    const followUpUpsert = vi.fn().mockResolvedValue({ error: null });
    const replyInsert = vi.fn().mockResolvedValue({ error: null });
    const persistedContact: Record<string, unknown> = options?.latestContact ||
        { pipeline_stage: 'engaged', ...options?.contact };
    const contactUpdate = vi.fn((payload: Record<string, unknown>) => {
        const filters: Array<[string, unknown]> = [];
        const run = () => {
            const matches = filters.every(([key, value]) => !(key in persistedContact) || persistedContact[key] === value);
            if (matches) Object.assign(persistedContact, payload);
            return { data: matches ? { id: 'contact_row_1' } : null, error: null };
        };
        const chain: any = {
            eq: vi.fn((key, value) => { filters.push([key, value]); return chain; }),
            select: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => run()),
            then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject)
        };
        return chain;
    });
    const from = vi.fn((table: string) => {
        if (table === 'pages') {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: { id: 'page_row_1', name: 'Test Page', access_token: 'page_access_token_1' },
                            error: null
                        })
                    })
                })
            };
        }
        if (table === 'contacts') {
            return {
                select: vi.fn((columns: string) => ({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockImplementation(async () => ({
                                data: columns.startsWith('pipeline_stage,') ? { ...persistedContact } : !options?.newContact && options?.config
                                    ? { id: 'contact_row_1', name: 'Photo Contact', pipeline_stage: 'engaged', profile_pic: null, ...options?.contact } : null,
                                error: null
                            }))
                        })
                    })
                })),
                upsert: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: { id: 'contact_row_1', name: 'Photo Contact', pipeline_stage: 'engaged', best_contact_hour: options?.bestContactHour, ...options?.contact },
                            error: null
                        })
                    })
                }),
                update: contactUpdate
            };
        }
        if (table === 'chatbot_configs') {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockImplementation(async () => ({ data: { ...chatbotConfig }, error: null }))
                    })
                })
            };
        }
        if (table === 'chatbot_follow_up_jobs') {
            return {
                upsert: followUpUpsert,
                update: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            in: vi.fn().mockResolvedValue({ error: null })
                        })
                    })
                })
            };
        }
        if (table === 'chatbot_contact_states') {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({ data: options?.state || null, error: null })
                        })
                    })
                }),
                upsert: stateUpsert,
                update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
            };
        }
        if (table === 'chatbot_reply_events') {
            return {
                insert: replyInsert,
                update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
            };
        }
        if (table === 'outbound_message_events') {
            return { upsert: vi.fn().mockResolvedValue({ error: null }) };
        }
        if (table === 'contact_interactions') {
            return {
                insert: vi.fn().mockResolvedValue({ error: null }),
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockResolvedValue({ data: [{ hour_of_day: 22 }], error: null })
                    })
                })
            };
        }
        if (table === 'welcome_messages') return { select: welcomeSelect };
        if (table === 'chatbot_configs') {
            return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            }) }) };
        }
        throw new Error(`Unexpected table: ${table}`);
    });

    return { from, rpc: vi.fn().mockResolvedValue({ error: null }), welcomeSelect, stateUpsert, contactUpdate, chatbotConfig, followUpUpsert, replyInsert };
}

function createSupabaseMockWithFirstInteractionColumnFailure() {
    const pageSingle = vi.fn().mockResolvedValue({
        data: {
            id: 'page_row_1',
            access_token: 'page_access_token_1'
        },
        error: null
    });
    const pageEq = vi.fn().mockReturnValue({ single: pageSingle });
    const pageSelect = vi.fn().mockReturnValue({ eq: pageEq });

    const existingContactMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null
    });
    const existingContactEqPsid = vi.fn().mockReturnValue({ maybeSingle: existingContactMaybeSingle });
    const existingContactEqPage = vi.fn().mockReturnValue({ eq: existingContactEqPsid });
    const contactsSelect = vi.fn().mockReturnValue({ eq: existingContactEqPage });

    const contactsUpsert = vi.fn()
        .mockReturnValueOnce({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: null,
                    error: {
                        message: "Could not find the 'first_interaction_at' column of 'contacts' in the schema cache"
                    }
                })
            })
        })
        .mockReturnValueOnce({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: {
                        id: 'contact_row_2',
                        name: 'Fallback Contact'
                    },
                    error: null
                })
            })
        });

    const contactsUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const contactsUpdate = vi.fn().mockReturnValue({ eq: contactsUpdateEq });

    const welcomeSingle = vi.fn().mockResolvedValue({
        data: {
            enabled: false,
            message_text: '',
            buttons: []
        },
        error: null
    });
    const welcomeEq = vi.fn().mockReturnValue({ single: welcomeSingle, maybeSingle: welcomeSingle });
    const welcomeSelect = vi.fn().mockReturnValue({ eq: welcomeEq });

    const interactionsInsert = vi.fn().mockResolvedValue({ error: null });
    const interactionsSelectEqFromContact = vi.fn().mockResolvedValue({
        data: [{ hour_of_day: 22 }],
        error: null
    });
    const interactionsSelectEqContact = vi.fn().mockReturnValue({ eq: interactionsSelectEqFromContact });
    const interactionsSelect = vi.fn().mockReturnValue({ eq: interactionsSelectEqContact });

    const from = vi.fn((table: string) => {
        if (table === 'pages') {
            return {
                select: pageSelect
            };
        }

        if (table === 'contacts') {
            return {
                select: contactsSelect,
                upsert: contactsUpsert,
                update: contactsUpdate
            };
        }

        if (table === 'welcome_messages') {
            return {
                select: welcomeSelect
            };
        }

        if (table === 'contact_interactions') {
            return {
                insert: interactionsInsert,
                select: interactionsSelect
            };
        }

        if (table === 'chatbot_configs') {
            return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            }) }) };
        }
        throw new Error(`Unexpected table: ${table}`);
    });

    return {
        from,
        contactsUpsert
    };
}

function createSupabaseMockWithGenericUpsertFailure() {
    const pageSingle = vi.fn().mockResolvedValue({
        data: {
            id: 'page_row_1',
            access_token: 'page_access_token_1'
        },
        error: null
    });
    const pageEq = vi.fn().mockReturnValue({ single: pageSingle });
    const pageSelect = vi.fn().mockReturnValue({ eq: pageEq });

    const existingContactMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null
    });
    const existingContactEqPsid = vi.fn().mockReturnValue({ maybeSingle: existingContactMaybeSingle });
    const existingContactEqPage = vi.fn().mockReturnValue({ eq: existingContactEqPsid });
    const contactsSelect = vi.fn().mockReturnValue({ eq: existingContactEqPage });

    const contactsUpsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
                data: null,
                error: {
                    message: 'insert/update failed due to transient database issue'
                }
            })
        })
    });

    const contactsInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
                data: {
                    id: 'contact_row_inserted',
                    name: 'Broken Contact'
                },
                error: null
            })
        })
    });

    const contactsUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    const from = vi.fn((table: string) => {
        if (table === 'pages') {
            return {
                select: pageSelect
            };
        }

        if (table === 'contacts') {
            return {
                select: contactsSelect,
                upsert: contactsUpsert,
                insert: contactsInsert,
                update: contactsUpdate
            };
        }

        if (table === 'welcome_messages') {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: {
                                enabled: false,
                                message_text: '',
                                buttons: []
                            },
                            error: null
                        }),
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: {
                                enabled: false,
                                message_text: '',
                                buttons: []
                            },
                            error: null
                        })
                    })
                })
            };
        }

        if (table === 'contact_interactions') {
            return {
                insert: vi.fn().mockResolvedValue({ error: null }),
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockResolvedValue({ data: [], error: null })
                    })
                })
            };
        }

        if (table === 'chatbot_configs') {
            return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            }) }) };
        }
        throw new Error(`Unexpected table: ${table}`);
    });

    return {
        from,
        contactsUpsert,
        contactsInsert
    };
}

describe('POST /api/facebook/webhook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.loadChatbotDeliveryHistory.mockReset().mockResolvedValue([]);
        mocks.reserveChatbotMessage.mockReset().mockResolvedValue('delivery-id');
        mocks.finishChatbotMessage.mockReset().mockResolvedValue(undefined);
        vi.stubEnv('NODE_ENV', 'test');
        mocks.handleFollowUpWorkflowContactReply.mockResolvedValue({
            checked: 0,
            scheduled: 0,
            continued: 0,
            reset: 0,
            sent: 0,
            stopped: 0,
            completed: 0,
            skipped: 0,
            errors: 0
        });
        mocks.triggerReplyWorkflowAutomations.mockResolvedValue({
            checked: 0,
            sent: 0,
            stopped: 0,
            skipped: 0,
            errors: 0
        });
        mocks.stopWorkflowAutomationsFromPageMessage.mockResolvedValue({
            checked: 0,
            stopped: 0,
            skipped: 0
        });
        mocks.getConversationForPsid.mockResolvedValue(null);
        mocks.getMessengerContactLabels.mockReset().mockResolvedValue([]);
        mocks.analyzeInboundCustomerImages.mockResolvedValue('A payment receipt showing PHP 150.');
        mocks.generateChatbotResponse.mockResolvedValue({
            reply: 'Thanks, I can see the PHP 150 receipt.',
            messages: ['Thanks, I can see the PHP 150 receipt.'],
            knowledge: [],
            collected_details: {},
            missing_details: [],
            details_complete: false
        });
        mocks.sendMessage.mockResolvedValue({ message_id: 'mid.reply' });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('creates new contacts and enriches profile from Facebook on first inbound message', async () => {
        const supabase = createSupabaseMock();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Jane Contact',
            profile_pic: 'https://example.com/jane.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(mocks.getUserProfile).toHaveBeenCalledWith(
            'contact_psid_1',
            'page_access_token_1',
            { timeoutMs: 2500 }
        );

        expect(supabase.contactsUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                page_id: 'page_row_1',
                psid: 'contact_psid_1',
                name: 'Jane Contact',
                profile_pic: 'https://example.com/jane.jpg'
            }),
            {
                onConflict: 'page_id,psid'
            }
        );
    });

    it('refreshes existing contacts that are missing names', async () => {
        const supabase = createSupabaseMock({
            existingContact: {
                id: 'contact_row_1',
                name: null,
                profile_pic: null
            }
        });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Recovered Contact Name',
            profile_pic: 'https://example.com/recovered.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(mocks.getUserProfile).toHaveBeenCalledWith(
            'contact_psid_1',
            'page_access_token_1',
            { timeoutMs: 2500 }
        );

        expect(supabase.contactsUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                page_id: 'page_row_1',
                psid: 'contact_psid_1',
                name: 'Recovered Contact Name',
                profile_pic: 'https://example.com/recovered.jpg'
            }),
            {
                onConflict: 'page_id,psid'
            }
        );
    });

    it('refreshes existing contacts that still have placeholder Unknown Name values', async () => {
        const supabase = createSupabaseMock({
            existingContact: {
                id: 'contact_row_1',
                name: 'Unknown Name',
                profile_pic: null
            }
        });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Recovered Contact Name',
            profile_pic: 'https://example.com/recovered.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(mocks.getUserProfile).toHaveBeenCalledWith(
            'contact_psid_1',
            'page_access_token_1',
            { timeoutMs: 2500 }
        );

        const payload = supabase.contactsUpsert.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.name).toBe('Recovered Contact Name');
        expect(payload.profile_pic).toBe('https://example.com/recovered.jpg');
    });

    it('clears existing Messenger Contact placeholders when no real name is available', async () => {
        const supabase = createSupabaseMock({
            existingContact: {
                id: 'contact_row_1',
                name: 'MESSENGER CONTACT',
                profile_pic: null
            }
        });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'MESSENGER CONTACT',
            profile_pic: 'https://example.com/recovered.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);

        const payload = supabase.contactsUpsert.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.name).toBeNull();
        expect(payload.profile_pic).toBe('https://example.com/recovered.jpg');
    });

    it('uses webhook sender names when profile lookup only returns Messenger Contact', async () => {
        const supabase = createSupabaseMock({
            existingContact: {
                id: 'contact_row_1',
                name: null,
                profile_pic: null
            }
        });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Messenger Contact',
            profile_pic: 'https://example.com/recovered.jpg'
        });

        const response = await POST(createWebhookRequest({
            object: 'page',
            entry: [
                {
                    id: 'fb_page_1',
                    messaging: [
                        {
                            sender: { id: 'contact_psid_1', name: 'Real Sender Name' },
                            recipient: { id: 'fb_page_1' },
                            timestamp: 1700000000000,
                            message: { mid: 'mid.1', text: 'hello there' }
                        }
                    ]
                }
            ]
        }));

        expect(response.status).toBe(200);
        const payload = supabase.contactsUpsert.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.name).toBe('Real Sender Name');
        expect(payload.profile_pic).toBe('https://example.com/recovered.jpg');
    });

    it('immediately uses the conversation participant name when profile lookup has no usable name', async () => {
        const supabase = createSupabaseMock({
            existingContact: {
                id: 'contact_row_1',
                name: null,
                profile_pic: null
            }
        });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Messenger Contact'
        });
        mocks.getConversationForPsid.mockResolvedValue({
            id: 'conversation_1',
            participants: {
                data: [
                    { id: 'fb_page_1', name: 'Business Page' },
                    { id: 'contact_psid_1', name: 'Immediate Real Name' }
                ]
            },
            messages: { data: [] }
        });

        const response = await POST(createWebhookRequest());

        expect(response.status).toBe(200);
        expect(mocks.getConversationForPsid).toHaveBeenCalledWith(
            'fb_page_1',
            'contact_psid_1',
            'page_access_token_1',
            { throwOnError: true, timeoutMs: 2500 }
        );
        const payload = supabase.contactsUpsert.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.name).toBe('Immediate Real Name');
    });

    it('does not persist placeholder UNKNOWN name values from profile fetch', async () => {
        const supabase = createSupabaseMock({
            existingContact: {
                id: 'contact_row_1',
                name: null,
                profile_pic: null
            }
        });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'UNKNOWN',
            profile_pic: 'https://example.com/recovered.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);

        const payload = supabase.contactsUpsert.mock.calls[0][0] as Record<string, unknown>;
        expect(payload).not.toHaveProperty('name');
        expect(payload.profile_pic).toBe('https://example.com/recovered.jpg');
    });

    it('constructs contact name from first_name and last_name when combined name is missing', async () => {
        const supabase = createSupabaseMock();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            first_name: 'Maria',
            last_name: 'Santos',
            profile_pic: 'https://example.com/maria.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(mocks.getUserProfile).toHaveBeenCalledWith(
            'contact_psid_1',
            'page_access_token_1',
            { timeoutMs: 2500 }
        );

        const payload = supabase.contactsUpsert.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.name).toBe('Maria Santos');
    });

    it('retries contact upsert without first_interaction_at when schema is older', async () => {
        const supabase = createSupabaseMockWithFirstInteractionColumnFailure();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Fallback Contact',
            profile_pic: 'https://example.com/fallback.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(supabase.contactsUpsert).toHaveBeenCalledTimes(2);

        const firstPayload = supabase.contactsUpsert.mock.calls[0][0] as Record<string, unknown>;
        const secondPayload = supabase.contactsUpsert.mock.calls[1][0] as Record<string, unknown>;

        expect(firstPayload).toHaveProperty('first_interaction_at');
        expect(secondPayload).not.toHaveProperty('first_interaction_at');
    });

    it('falls back to insert for new contact when upsert fails unexpectedly', async () => {
        const supabase = createSupabaseMockWithGenericUpsertFailure();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Broken Contact',
            profile_pic: 'https://example.com/broken.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(supabase.contactsUpsert).toHaveBeenCalledTimes(1);
        expect(supabase.contactsInsert).toHaveBeenCalledTimes(1);
    });

    it('ingests inbound standby events so contacts appear without manual sync', async () => {
        const supabase = createSupabaseMock();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Standby Contact',
            profile_pic: 'https://example.com/standby.jpg'
        });

        const response = await POST(createWebhookRequest({
            object: 'page',
            entry: [
                {
                    id: 'fb_page_1',
                    standby: [
                        {
                            sender: { id: 'contact_psid_1' },
                            recipient: { id: 'fb_page_1' },
                            timestamp: 1700000000000,
                            message: { mid: 'mid.2', text: 'hi from standby' }
                        }
                    ]
                }
            ]
        }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(mocks.getUserProfile).toHaveBeenCalledWith(
            'contact_psid_1',
            'page_access_token_1',
            { timeoutMs: 2500 }
        );
        expect(supabase.contactsUpsert).toHaveBeenCalledTimes(1);
    });

    const detailFields = Array.from({ length: 20 }, (_, i) => `Field ${i}`);
    const goalConfig = { details_to_collect: detailFields, details_completion_percent: 26, stop_when_details_collected: true };
    const currentInbound = (text = 'Our new details.') => createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
        sender: { id: 'contact_psid_1' }, recipient: { id: 'fb_page_1' },
        timestamp: Date.parse('2026-10-08T12:00:00Z'), message: { mid: 'mid.goal', text }
    }] }] });
    const activeState = (details: Record<string, string>) => ({ page_id: 'page_row_1', contact_id: 'contact_row_1',
        status: 'active', started_at: '2026-10-08T01:00:00Z', window_expires_at: '2026-10-15T01:00:00Z',
        collected_details: details, missing_details: [], stop_reason: null, stopped_at: null,
        last_inbound_at: null, last_bot_reply_at: null });

    const formPriorityConfig = { instructions: 'PRIORITIZE_FILL_UP_FORM: true\nALLOW_BRIEF_FORM: true\nSONG_BRIEF_FORM: hiraya-seven-fields\nSHORT_HUMAN_REPLIES: true',
        details_to_collect: ['Business name', 'Main products or services', 'Tagline or slogan', 'Lyrics language', 'Vocal preference', 'Preferred mood/style', 'Additional requests'],
        details_completion_percent: 100 };
    it('prioritizes the owner form when a model returns only an individual question', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: formPriorityConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['Pop or acoustic?'], collected_details: {}, missing_details: [], details_complete: false });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        expect(mocks.sendMessage.mock.calls[0][3]).toContain('1. Business Name:');
        expect(mocks.sendMessage.mock.calls[0][3]).toContain('7. Additional requests:');
        expect(mocks.sendMessage.mock.calls[0][3]).not.toContain('Pop or acoustic?');
        expect(mocks.sendMessage.mock.calls[0][3]).toMatch(/Ano po ang business name na ilalagay natin\?$/);
        expect(supabase.rpc).toHaveBeenCalledWith('record_chatbot_form_sent', expect.objectContaining({
            p_page_id: 'page_row_1', p_contact_id: 'contact_row_1', p_history_start_at: null
        }));
    });
    it('still offers the form when reply generation is unavailable', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: formPriorityConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockRejectedValue(new Error('Provider unavailable'));
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        expect(mocks.sendMessage.mock.calls[0][3]).toMatch(/^Pa-sagutan po para sa kanta\n/);
    });
    it('does not record form delivery when Messenger rejects the send', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: formPriorityConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['What genre?'], collected_details: {}, missing_details: [], details_complete: false });
        mocks.sendMessage.mockRejectedValue(new Error('Messenger unavailable'));
        await POST(currentInbound());
        expect(supabase.rpc).not.toHaveBeenCalledWith('record_chatbot_form_sent', expect.anything());
    });
    it('suppresses a delivery already reserved by another worker without retrying the inbound event', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: formPriorityConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['What genre?'], collected_details: {}, missing_details: [], details_complete: false });
        mocks.reserveChatbotMessage.mockResolvedValue(null);
        const response = await POST(currentInbound());
        expect(response.status).toBe(200);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(mocks.finishChatbotMessage).not.toHaveBeenCalled();
    });
    it('adds previously delivered message memory when Facebook omits it from history', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: formPriorityConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        const previous = { id: 'sent-before-window', message: 'A bright opening can highlight your bakery.',
            from: { id: 'fb_page_1', name: 'Page' }, created_time: '2026-10-08T10:00:00Z' };
        mocks.loadChatbotDeliveryHistory.mockResolvedValue([previous]);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['What genre?'], collected_details: {}, missing_details: [], details_complete: false });
        await POST(currentInbound());
        expect(mocks.generateChatbotResponse).toHaveBeenCalledWith(expect.objectContaining({ history: expect.arrayContaining([previous]) }));
    });
    it('retains newly filled answers during a provider outage and omits them from the missing form', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: formPriorityConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockRejectedValue(new Error('Provider unavailable'));
        await POST(currentInbound('1. Business Name: Sunrise Bakery\n4. English or Tagalog lyrics: Tagalog'));
        expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ collected_details: {
            'Business name': 'Sunrise Bakery', 'Lyrics language': 'Tagalog'
        } }), expect.anything());
        expect(mocks.sendMessage.mock.calls[0][3]).not.toContain('1. Business Name:');
        expect(mocks.sendMessage.mock.calls[0][3]).not.toContain('4. English or Tagalog lyrics:');
        expect(mocks.sendMessage.mock.calls[0][3]).toContain('2. Specialty/Products:');
    });
    it('does not resend a form missing from history when durable delivery exists', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: { ...activeState({ 'Business name': 'Sunrise Bakery' }),
            form_sent_at: '2026-10-17T08:00:00Z' }, config: formPriorityConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['Anong produkto ang itatampok natin?'],
            collected_details: { 'Business name': 'Sunrise Bakery' }, missing_details: [], details_complete: false });
        await POST(currentInbound());
        expect(mocks.generateChatbotResponse).toHaveBeenCalledWith(expect.objectContaining({ formSentAt: '2026-10-17T08:00:00Z' }));
        expect(mocks.sendMessage.mock.calls[0][3]).not.toContain('Business Name:');
        expect(supabase.rpc).not.toHaveBeenCalledWith('record_chatbot_form_sent', expect.anything());
    });
    it('does not send a priority form when Facebook shows Qualified', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: formPriorityConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getMessengerContactLabels.mockResolvedValue([{ id: 'q', page_label_name: 'Qualified' }]);
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('blocks a live Qualified inbox label when message history contains no stage event', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getMessengerContactLabels.mockResolvedValue([{ id: 'q', page_label_name: 'Qualified' }]);
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'stopped', stop_reason: 'qualified' }),
            { onConflict: 'page_id,contact_id' });
    });
    it('blocks a label-only qualification that arrives during reply generation', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockImplementation(async () => {
            mocks.getMessengerContactLabels.mockResolvedValue([{ id: 'q', page_label_name: 'Qualified' }]);
            return { messages: ['Do not send.'], collected_details: {}, missing_details: [], details_complete: false };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).toHaveBeenCalledTimes(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });
    it('blocks the remaining bubbles after a label-only qualification', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ config: { split_messages: true, max_message_parts: 3 } });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['First.', 'Second.'],
            collected_details: {}, missing_details: [], details_complete: false });
        mocks.sendMessage.mockImplementation(async () => {
            mocks.getMessengerContactLabels.mockResolvedValue([{ id: 'q', page_label_name: 'Qualified' }]);
            return { message_id: 'first' };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });
    it('does not send a fallback when the current labels cannot be verified', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getMessengerContactLabels.mockRejectedValue(new Error('Unsupported get request'));
        expect((await POST(currentInbound())).status).toBe(500);
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });
    it('blocks a transient retry when Qualified is added after the initial send attempt', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['Reply.'],
            collected_details: {}, missing_details: [], details_complete: false });
        mocks.sendMessage.mockImplementation(async (...args) => {
            mocks.getMessengerContactLabels.mockResolvedValue([{ id: 'q', page_label_name: 'Qualified' }]);
            await args[10]();
            return { message_id: 'must-not-send' };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        expect(supabase.stateUpsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'stopped', stop_reason: 'qualified' }),
            { onConflict: 'page_id,contact_id' });
    });

    it('answers an Intake inquiry while keeping all other eligibility checks', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [{ id: 'intake', from: { id: 'fb_page_1' },
            message: 'Lead stage set to Intake', created_time: '2026-10-07T12:00:00Z' }] } });
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['How can we help?'],
            collected_details: {}, missing_details: [], details_complete: false });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).toHaveBeenCalledTimes(1);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });

    it.each(['Intake', 'Contacted', 'Interested', 'Qualified'])(
        'processes native %s stage notifications without treating Intake as a human reply', async stage => {
            const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: {} });
            const rpc = vi.fn().mockResolvedValue({ error: null });
            mocks.getSupabaseAdmin.mockReturnValue({ ...supabase, rpc });
            const response = await POST(createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
                sender: { id: 'fb_page_1' }, recipient: { id: 'contact_psid_1' }, timestamp: Date.parse('2026-10-08T12:00:00Z'),
                message: { mid: 'stage-echo', is_echo: true, text: `Lead stage set to ${stage}` }
            }] }] }));
            expect(response.status).toBe(200);
            expect(rpc).not.toHaveBeenCalled();
            expect(mocks.sendMessage).not.toHaveBeenCalled();
            if (stage === 'Intake') expect(supabase.stateUpsert).not.toHaveBeenCalled();
            else expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'stopped',
                stop_reason: stage === 'Qualified' ? 'qualified' : 'manual' }), { onConflict: 'page_id,contact_id' });
        });

    it('does not apply a redelivered stage notification from before an explicit trial reset', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ state: { ...activeState({}), history_start_at: '2026-10-08T13:00:00Z' }, config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
            sender: { id: 'fb_page_1' }, recipient: { id: 'contact_psid_1' }, timestamp: Date.parse('2026-10-08T12:00:00Z'),
            message: { mid: 'old-stage-echo', is_echo: true, text: 'Lead stage set to Contacted' }
        }] }] }))).status).toBe(200);
        expect(supabase.stateUpsert).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it.each(['Qualified', 'Converted', 'Not Qualified', 'Order Created', 'Contacted', 'Interested', 'Custom stage'])(
        'does not generate or send for an existing non-Intake stage %s, even with legacy stop flags disabled', async stage => {
            const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: {
                stop_on_qualified: false, stop_on_not_qualified: false, stop_on_converted: false, stop_on_order_created: false } });
            mocks.getSupabaseAdmin.mockReturnValue(supabase);
            mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [{ id: 'closed', from: { id: 'fb_page_1' },
                message: `Lead stage set to ${stage}`, created_time: '2026-10-07T12:00:00Z' }] } });
            expect((await POST(currentInbound())).status).toBe(200);
            expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
            expect(mocks.sendMessage).not.toHaveBeenCalled();
            expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'stopped' }),
                { onConflict: 'page_id,contact_id' });
        });

    it.each(['Qualified', 'Converted', 'Not Qualified', 'Order Created', 'Contacted', 'Interested', 'Custom stage'])(
        'stops a reply when Facebook changes to %s during generation', async stage => {
            const supabase = createPhotoChatbotSupabaseMock({ state: activeState({}), config: goalConfig });
            mocks.getSupabaseAdmin.mockReturnValue(supabase);
            mocks.generateChatbotResponse.mockImplementation(async () => {
                mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [{
                    id: 'stage-event', message: `Lead stage set to ${stage}.`, from: { id: 'fb_page_1' },
                    created_time: '2026-10-08T12:00:01Z'
                }] } });
                return { messages: ['Another question?'], collected_details: {}, missing_details: [], details_complete: false };
            });
            expect((await POST(currentInbound())).status).toBe(200);
            expect(mocks.generateChatbotResponse).toHaveBeenCalledTimes(1);
            expect(mocks.sendMessage).not.toHaveBeenCalled();
            expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({
                status: 'stopped', stop_reason: ['Contacted', 'Interested', 'Custom stage'].includes(stage)
                    ? 'manual' : stage.toLowerCase().replaceAll(' ', '_')
            }), { onConflict: 'page_id,contact_id' });
        }
    );

    it.each(['Converted', 'Contacted'])('stops remaining bubbles when the lead changes to %s after the first bubble', async stage => {
        const supabase = createPhotoChatbotSupabaseMock({ config: { split_messages: true, max_message_parts: 3 } });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['First reply.', 'Second reply.'],
            collected_details: {}, missing_details: [], details_complete: false });
        mocks.sendMessage.mockImplementation(async () => {
            mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [{
                id: 'stage-event', message: `Lead stage set to ${stage}.`, from: { id: 'fb_page_1' },
                created_time: '2026-10-08T12:00:01Z'
            }] } });
            return { message_id: 'first-bubble' };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        expect(supabase.stateUpsert).toHaveBeenLastCalledWith(expect.objectContaining({
            status: 'stopped', stop_reason: stage === 'Converted' ? 'converted' : 'manual'
        }), { onConflict: 'page_id,contact_id' });
    });

    it('stops remaining bubbles when staff changes the saved pipeline stage', async () => {
        const latestContact = { pipeline_stage: 'engaged', pipeline_stage_source: 'chatbot' };
        const supabase = createPhotoChatbotSupabaseMock({ latestContact,
            config: { split_messages: true, max_message_parts: 3 } });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['First reply.', 'Second reply.'],
            collected_details: {}, missing_details: [], details_complete: false });
        mocks.sendMessage.mockImplementation(async () => {
            latestContact.pipeline_stage = 'not_qualified';
            latestContact.pipeline_stage_source = 'manual';
            return { message_id: 'first-bubble' };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('schedules later-day reminders using the refreshed best hour instead of the stale contact hour', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ bestContactHour: 7, config: {
            follow_up_enabled: true, follow_up_quick_delays_minutes: [30], follow_up_best_time_days: [2,3,4,5,6,7],
            instructions: 'FOLLOW_UP_LATER_DAYS_MODE: staff-review', details_to_collect: []
        } });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['We can help with your song.'], collected_details: {}, missing_details: [], details_complete: false });
        expect((await POST(currentInbound())).status).toBe(200);
        const jobs = supabase.followUpUpsert.mock.calls[0][0];
        expect(jobs.filter((job: any) => job.schedule_type === 'manual_human_agent')).toHaveLength(6);
        expect(jobs[1].due_at).toBe('2026-10-09T14:00:00.000Z'); // 10 PM Philippine time, freshly learned.
        expect(supabase.contactUpdate).toHaveBeenCalledWith(expect.objectContaining({ best_contact_hour: 22 }));
        expect(supabase.contactUpdate.mock.invocationCallOrder[0]).toBeLessThan(supabase.followUpUpsert.mock.invocationCallOrder[0]);
    });

    it('saves the goal stop before delivery and sends only one closing instead of another question', async () => {
        const answers = Object.fromEntries(detailFields.slice(0, 6).map(k => [k, 'provided']));
        const supabase = createPhotoChatbotSupabaseMock({ config: goalConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['Which singer do you want?'], collected_details: answers, missing_details: detailFields.slice(6), details_complete: true });
        mocks.sendMessage.mockImplementation(async () => {
            expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ collected_details: answers, status: 'stopped', stop_reason: 'details_collected' }), { onConflict: 'page_id,contact_id' });
            return { message_id: 'mid.closing' };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        expect(mocks.sendMessage.mock.calls[0][3]).toBe('We have enough details for the next step.');
    });

    it('stops before AI generation when saved answers already meet the lowered target', async () => {
        const answers = Object.fromEntries(detailFields.slice(0, 6).map(k => [k, 'provided']));
        const supabase = createPhotoChatbotSupabaseMock({ config: goalConfig, state: activeState(answers) });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ stop_reason: 'details_collected', status: 'stopped' }), { onConflict: 'page_id,contact_id' });
    });


    it('requests recovery after a database failure during generation before a send was attempted', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ config: {} });
        let failStateReads = false;
        const originalFrom = supabase.from;
        const stateRead = { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'Temporary database failure' } }) }) }) }) };
        mocks.getSupabaseAdmin.mockReturnValue({ ...supabase, from: (table: string) => {
            if (table === 'chatbot_contact_states' && failStateReads) return stateRead;
            return originalFrom(table);
        } });
        mocks.generateChatbotResponse.mockImplementation(async () => {
            failStateReads = true;
            return { messages: ['Hello!'], collected_details: {}, missing_details: [], details_complete: false };
        });
        expect((await POST(currentInbound())).status).toBe(500);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(supabase.replyInsert).toHaveBeenCalledTimes(1);
    });

    it('requests redelivery when live conversation checks are temporarily unavailable', async () => {
        const supabase = createPhotoChatbotSupabaseMock();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getConversationForPsid.mockRejectedValue(new Error('Facebook temporarily unavailable'));
        expect((await POST(currentInbound())).status).toBe(500);
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('requests redelivery when chatbot settings cannot be read', async () => {
        const supabase = createPhotoChatbotSupabaseMock();
        const from = supabase.from;
        mocks.getSupabaseAdmin.mockReturnValue({ ...supabase, from: (table: string) => {
            if (table === 'chatbot_configs') throw new Error('Temporary database failure');
            return from(table);
        } });
        expect((await POST(currentInbound())).status).toBe(500);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('asks Meta to redeliver after a temporary send rejection', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['We can help with your song.'],
            collected_details: {}, missing_details: [], details_complete: false });
        mocks.sendMessage.mockRejectedValue(Object.assign(new Error('(#2) Service temporarily unavailable'), { code: 2 }));
        expect((await POST(currentInbound())).status).toBe(500);
    });

    it('does not request redelivery after a partially delivered reply', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ config: { split_messages: true, max_message_parts: 3 } });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['First reply.', 'Second reply.'],
            collected_details: {}, missing_details: [], details_complete: false });
        mocks.sendMessage.mockResolvedValueOnce({ message_id: 'mid.delivered' })
            .mockRejectedValueOnce(Object.assign(new Error('(#2) Service temporarily unavailable'), { code: 2 }));
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('retains extracted answers and the stop even if the closing delivery fails', async () => {
        const answers = Object.fromEntries(detailFields.slice(0, 6).map(k => [k, 'provided']));
        const supabase = createPhotoChatbotSupabaseMock({ config: goalConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['Another question?'], collected_details: answers, missing_details: [], details_complete: true });
        mocks.sendMessage.mockRejectedValue(new Error('Delivery failed'));
        expect((await POST(currentInbound())).status).toBe(200);
        expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ collected_details: answers, status: 'stopped' }), { onConflict: 'page_id,contact_id' });
        expect(supabase.contactUpdate).toHaveBeenCalledWith(expect.objectContaining({ pipeline_stage: 'qualified', pipeline_stage_source: 'chatbot' }));
    });

    it.each([
        { count: 3, stopped: false }, { count: 6, stopped: false },
        { count: 3, stopped: true }, { count: 6, stopped: true }
    ])('retains $count saved answers after inactivity (expiry stop = $stopped)', async ({ count, stopped }) => {
        const answers = Object.fromEntries(detailFields.slice(0, count).map(k => [k, 'previously supplied']));
        const supabase = createPhotoChatbotSupabaseMock({ config: goalConfig, state: {
            ...activeState(answers), started_at: '2026-09-20T01:00:00Z', window_expires_at: '2026-09-27T01:00:00Z',
            status: stopped ? 'stopped' : 'active', stop_reason: stopped ? 'window_expired' : null
        } });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['What is your deadline?'], collected_details: {}, missing_details: [], details_complete: false });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ collected_details: answers }), { onConflict: 'page_id,contact_id' });
        if (count === 6) {
            expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
            expect(mocks.sendMessage).not.toHaveBeenCalled();
        } else {
            expect(mocks.generateChatbotResponse).toHaveBeenCalledWith(expect.objectContaining({ collectedDetails: answers }));
        }
    });

    it.each(['disabled', 'trial_changed', 'rules_changed'])('suppresses a generated reply when bot settings change: %s', async change => {
        const supabase = createPhotoChatbotSupabaseMock({ config: goalConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockImplementation(async () => {
            if (change === 'disabled') supabase.chatbotConfig.enabled = false;
            else if (change === 'trial_changed') { supabase.chatbotConfig.trial_mode_enabled = true; supabase.chatbotConfig.trial_contact_id = 'someone-else'; }
            else supabase.chatbotConfig.updated_at = '2026-10-08T12:00:02Z';
            return { messages: ['Another question?'], collected_details: {}, missing_details: [], details_complete: false };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(supabase.stateUpsert).not.toHaveBeenCalled();
    });

    it('does not reopen a conversation stopped while a reply was being generated', async () => {
        const state: Record<string, unknown> = activeState({});
        const supabase = createPhotoChatbotSupabaseMock({ state, config: goalConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockImplementation(async () => {
            state.status = 'stopped'; state.stop_reason = 'opt_out';
            return { messages: ['Another question?'], collected_details: {}, missing_details: [], details_complete: false };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).toHaveBeenCalledTimes(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(supabase.stateUpsert).not.toHaveBeenCalled();
    });

    it('suppresses an older generated reply when a newer customer message arrived', async () => {
        const latestContact: Record<string, unknown> = { pipeline_stage: 'engaged', last_inbound_at: '2026-10-08T12:00:00Z' };
        const supabase = createPhotoChatbotSupabaseMock({ config: goalConfig, latestContact });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockImplementation(async () => {
            latestContact.last_inbound_at = '2026-10-08T12:00:02Z';
            return { messages: ['An older question?'], collected_details: {}, missing_details: [], details_complete: false };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).toHaveBeenCalledTimes(1);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(supabase.stateUpsert).not.toHaveBeenCalled();
    });



    function completedSupportSetup(source = 'chatbot', stopReason = 'details_collected') {
        const answers = Object.fromEntries(detailFields.slice(0, 6).map(k => [k, 'provided']));
        const state: Record<string, unknown> = { ...activeState(answers), status: 'stopped', stop_reason: stopReason,
            last_inbound_at: '2026-10-07T12:00:00Z', stopped_at: '2026-10-07T12:00:10Z' };
        const contact = { pipeline_stage: 'qualified', pipeline_stage_source: source };
        const supabase = createPhotoChatbotSupabaseMock({ config: { ...goalConfig, follow_up_enabled: true },
            state, contact, latestContact: { ...contact, last_inbound_at: '2026-10-08T12:00:00Z' } });
        return { supabase, state, answers };
    }

    it('does not answer a fresh inquiry after automatic qualification', async () => {
        const { supabase, answers } = completedSupportSetup();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['We can help with your new question.'],
            collected_details: {}, missing_details: [], details_complete: true });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({
            status: 'stopped', stop_reason: 'qualified', collected_details: answers
        }), { onConflict: 'page_id,contact_id' });
        expect(supabase.followUpUpsert).not.toHaveBeenCalled();
    });

    it.each(['manual', 'messenger', 'system', 'chatbot'])('keeps a %s qualification closed for automatic support', async source => {
        const { supabase } = completedSupportSetup(source);
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it.each(['opt_out', 'refusal', 'manual', 'converted', 'order_created'])('does not bypass a saved %s stop', async reason => {
        const { supabase } = completedSupportSetup('chatbot', reason);
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('persists a new opt-out from an already completed customer', async () => {
        const { supabase } = completedSupportSetup();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
            sender: { id: 'contact_psid_1' }, recipient: { id: 'fb_page_1' }, timestamp: Date.parse('2026-10-08T12:00:00Z'),
            message: { mid: 'mid.optout', text: 'Stop messaging me' }
        }] }] }))).status).toBe(200);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'stopped', stop_reason: 'opt_out' }), { onConflict: 'page_id,contact_id' });
    });

    it('never starts generating a support reply for an already qualified lead', async () => {
        const { supabase } = completedSupportSetup();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockImplementation(async () => {
            mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [{ id: 'staff-stop',
                message: 'Lead stage set to Converted.', from: { id: 'fb_page_1' }, created_time: '2026-10-08T12:00:01Z' }] } });
            return { messages: ['We can help.'], collected_details: {}, missing_details: [], details_complete: true };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });


    it.each(['paused', 'checking', 'held'])('does not answer while a human takeover is %s', async status => {
        const state = { ...activeState({}), human_pause_status: status };
        const supabase = createPhotoChatbotSupabaseMock({ state, config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('stops a generated reply if a human takes over before delivery', async () => {
        const state: Record<string, unknown> = activeState({});
        const supabase = createPhotoChatbotSupabaseMock({ state, config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockImplementation(async () => {
            state.human_pause_status = 'paused';
            return { messages: ['Hello!'], collected_details: {}, missing_details: [], details_complete: false };
        });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('stops remaining bubbles when a human takes over after the first bubble', async () => {
        const state: Record<string, unknown> = activeState({});
        const supabase = createPhotoChatbotSupabaseMock({ state, config: { split_messages: true, max_message_parts: 3 } });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['First.', 'Second.'], collected_details: {}, missing_details: [], details_complete: false });
        mocks.sendMessage.mockImplementation(async () => { state.human_pause_status = 'paused'; return { message_id: 'mid.first' }; });
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('passes the saved current price into response generation', async () => {
        const state = { ...activeState({}), conversation_price_quote: 'PHP 450 for two songs', conversation_price_quoted_at: '2026-10-08T11:00:00Z' };
        const supabase = createPhotoChatbotSupabaseMock({ state, config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(currentInbound())).status).toBe(200);
        expect(mocks.generateChatbotResponse).toHaveBeenCalledWith(expect.objectContaining({
            conversationPriceQuote: expect.objectContaining({ text: 'PHP 450 for two songs' })
        }));
    });

    it.each([false, true])('records a native staff echo but ignores known automatic echoes (automatic = %s)', async automatic => {
        const supabase = createPhotoChatbotSupabaseMock({ config: {} });
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const query: any = { eq: () => query, maybeSingle: async () => ({ data: automatic ? { source_type: 'chatbot' } : null, error: null }) };
        mocks.getSupabaseAdmin.mockReturnValue({ ...supabase, rpc, from: (table: string) => table === 'outbound_message_events'
            ? { select: () => query } : supabase.from(table) });
        const response = await POST(createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
            sender: { id: 'fb_page_1' }, recipient: { id: 'contact_psid_1' }, timestamp: Date.parse('2026-10-08T12:00:00Z'),
            message: { mid: 'mid.human', is_echo: true, text: 'PHP 450 for two songs' }
        }] }] }));
        expect(response.status).toBe(200);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        if (automatic) expect(rpc).not.toHaveBeenCalled();
        else expect(rpc).toHaveBeenCalledWith('record_chatbot_human_takeover', expect.objectContaining({ p_price_quote: 'PHP 450 for two songs', p_resume_at: '2026-10-08T15:59:00.000Z' }));
    });

    it('answers a first text inquiry directly rather than allowing a welcome to swallow it', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ config: {}, newContact: true });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(createWebhookRequest())).status).toBe(200);
        expect(supabase.welcomeSelect).not.toHaveBeenCalled();
        expect(mocks.generateChatbotResponse).toHaveBeenCalledWith(expect.objectContaining({ inboundMessage: 'hello there' }));
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        expect(supabase.replyInsert).toHaveBeenCalledTimes(1);
    });

    it('answers a Messenger button inquiry without requiring a message object or mid', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ config: {}, newContact: true });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        const request = createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
            sender: { id: 'contact_psid_1' }, recipient: { id: 'fb_page_1' }, timestamp: 1791451200000,
            postback: { title: 'How much is a song?', payload: 'PRICE' }
        }] }] });
        expect((await POST(request)).status).toBe(200);
        expect(mocks.generateChatbotResponse).toHaveBeenCalledWith(expect.objectContaining({ inboundMessage: 'How much is a song?' }));
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        expect(supabase.replyInsert).toHaveBeenCalledWith(expect.objectContaining({ inbound_message_id: expect.stringMatching(/^postback:/) }));
        expect(mocks.handleFollowUpWorkflowContactReply).toHaveBeenCalled();
    });

    it.each(['audio', 'video', 'file'])('replies to a first %s attachment without claiming to understand it', async type => {
        const supabase = createPhotoChatbotSupabaseMock({ config: {}, newContact: true });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
            sender: { id: 'contact_psid_1' }, recipient: { id: 'fb_page_1' }, timestamp: 1791451200000,
            message: { mid: 'mid.media', attachments: [{ type, payload: { url: 'https://example.test/file' } }] }
        }] }] }))).status).toBe(200);
        expect(mocks.generateChatbotResponse).toHaveBeenCalledWith(expect.objectContaining({ inboundMessage: expect.stringContaining('contents are unavailable') }));
        expect(mocks.analyzeInboundCustomerImages).not.toHaveBeenCalled();
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('uses a safe fallback if the first generated answer is suppressed and the configured fallback is blank', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ config: { fallback_reply: '' }, newContact: true });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: [], collected_details: {}, missing_details: [], details_complete: false, reply_suppressed: true });
        expect((await POST(createWebhookRequest())).status).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        expect(mocks.sendMessage.mock.calls[0][3].trim().length).toBeGreaterThan(0);
    });

    it('keeps repetitive replies suppressed when the customer already received the same fallback', async () => {
        const supabase = createPhotoChatbotSupabaseMock({ config: {} });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [{ id: 'prior.reply', from: { id: 'fb_page_1' }, message: 'A teammate will reply soon.' }] } });
        mocks.generateChatbotResponse.mockRejectedValue(new Error('AI temporarily unavailable'));
        expect((await POST(createWebhookRequest())).status).toBe(200);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it.each(['model', 'reservation'])('retains follow-ups when %s suppresses a duplicate immediate reply', async mode => {
        const supabase = createPhotoChatbotSupabaseMock({ config: { follow_up_enabled: true,
            follow_up_quick_delays_minutes: [30], follow_up_best_time_days: [] } });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [{ id: 'prior.reply',
            from: { id: 'fb_page_1' }, message: 'A teammate will reply soon.' }] } });
        mocks.generateChatbotResponse.mockResolvedValue({ messages: mode === 'model' ? [] : ['A new reply.'],
            collected_details: {}, missing_details: [], details_complete: false, reply_suppressed: mode === 'model' });
        if (mode === 'reservation') mocks.reserveChatbotMessage.mockResolvedValue(null);
        expect((await POST(createWebhookRequest())).status).toBe(200);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        expect(supabase.followUpUpsert).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ schedule_type: 'response', status: 'pending', sequence_index: 0 })
        ]), expect.objectContaining({ onConflict: 'contact_id,anchor_inbound_at,schedule_type,sequence_index' }));
    });

    it.each(['read', 'delivery'])('does not send a welcome or chatbot reply for a first %s receipt', async type => {
        const supabase = createPhotoChatbotSupabaseMock({ config: {}, newContact: true });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        expect((await POST(createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
            sender: { id: 'contact_psid_1' }, recipient: { id: 'fb_page_1' }, timestamp: 1791451200000,
            [type]: { watermark: 1791451200000 }
        }] }] }))).status).toBe(200);
        expect(supabase.welcomeSelect).not.toHaveBeenCalled();
        expect(mocks.generateChatbotResponse).not.toHaveBeenCalled();
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('analyzes and replies to an image-only first message instead of sending only a welcome', async () => {
        const supabase = createPhotoChatbotSupabaseMock();
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Photo Contact'
        });
        mocks.getConversationForPsid.mockResolvedValue({
            id: 'conversation_1',
            participants: { data: [{ id: 'contact_psid_1', name: 'Photo Contact' }] },
            messages: {
                data: [{
                    id: 'mid.photo',
                    message: '',
                    from: { id: 'contact_psid_1', name: 'Photo Contact' },
                    created_time: '2026-10-04T10:00:00Z'
                }]
            }
        });

        const response = await POST(createWebhookRequest({
            object: 'page',
            entry: [{
                id: 'fb_page_1',
                messaging: [{
                    sender: { id: 'contact_psid_1' },
                    recipient: { id: 'fb_page_1' },
                    timestamp: 1791108000000,
                    message: {
                        mid: 'mid.photo',
                        attachments: [{
                            type: 'image',
                            payload: { url: 'https://cdn.example.test/receipt.jpg' }
                        }]
                    }
                }]
            }]
        }));

        expect(response.status).toBe(200);
        expect(supabase.welcomeSelect).not.toHaveBeenCalled();
        expect(mocks.analyzeInboundCustomerImages).toHaveBeenCalledWith({
            imageUrls: ['https://cdn.example.test/receipt.jpg'],
            caption: ''
        });
        expect(mocks.generateChatbotResponse).toHaveBeenCalledWith(expect.objectContaining({
            inboundMessage: expect.stringContaining('A payment receipt showing PHP 150.')
        }));
        expect(mocks.sendMessage).toHaveBeenCalledWith(
            'fb_page_1',
            'page_access_token_1',
            'contact_psid_1',
            'Thanks, I can see the PHP 150 receipt.',
            'RESPONSE',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            expect.any(Function)
        );
    });

    it.each([false, true])('excludes pre-reset prices and lead stops from a fresh trial (expired = %s)', async expired => {
        const cutoff = '2026-10-04T09:00:00Z';
        const supabase = createPhotoChatbotSupabaseMock({ state: {
            page_id: 'page_row_1', contact_id: 'contact_row_1', status: 'active',
            started_at: cutoff, window_expires_at: expired ? '2026-10-04T09:30:00Z' : '2026-10-11T09:00:00Z',
            collected_details: {}, missing_details: [], stop_reason: null, stopped_at: null,
            last_inbound_at: null, last_bot_reply_at: null, history_start_at: cutoff
        } });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({ id: 'contact_psid_1', name: 'Photo Contact' });
        const latest = { id: 'fresh-inbound', message: 'New business song inquiry', from: { id: 'contact_psid_1', name: 'Photo Contact' }, created_time: '2026-10-04T10:00:00Z' };
        mocks.getConversationForPsid.mockResolvedValue({ messages: { data: [latest,
            { id: 'old-stop', message: 'Lead stage set to Converted.', from: { id: 'fb_page_1' }, created_time: '2026-10-03T10:00:00Z' },
            { id: 'old-price', message: 'One song PHP299, okay?', from: { id: 'fb_page_1' }, created_time: '2026-10-02T10:00:00Z' }
        ] } });
        const response = await POST(createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
            sender: { id: 'contact_psid_1' }, recipient: { id: 'fb_page_1' }, timestamp: Date.parse(latest.created_time),
            message: { mid: latest.id, text: latest.message }
        }] }] }));
        expect(response.status).toBe(200);
        expect(mocks.generateChatbotResponse).toHaveBeenCalledWith(expect.objectContaining({ history: [latest], collectedDetails: {} }));
        expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ history_start_at: cutoff }), { onConflict: 'page_id,contact_id' });
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('sends welcome as RESPONSE with mapped buttons when welcome config has buttons', async () => {
        const supabase = createSupabaseMock({
            welcomeConfig: {
                enabled: true,
                message_text: 'Hi {first_name} handa ka na bang palakasin sales mo this month?',
                buttons: [
                    { type: 'URL', text: 'CLICK HERE!', url: 'https://meet.google.com/peh-jivc-tgx' },
                    { type: 'QUICK_REPLY', text: 'Talk to sales', payload: '' }
                ]
            }
        });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Jane Contact',
            profile_pic: 'https://example.com/jane.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

        const sendArgs = mocks.sendMessage.mock.calls[0];
        expect(sendArgs[0]).toBe('fb_page_1');
        expect(sendArgs[1]).toBe('page_access_token_1');
        expect(sendArgs[2]).toBe('contact_psid_1');
        expect(sendArgs[4]).toBe('RESPONSE');
        expect(sendArgs[8]).toEqual([
            { type: 'URL', text: 'CLICK HERE!', url: 'https://meet.google.com/peh-jivc-tgx' },
            { type: 'POSTBACK', text: 'Talk to sales', payload: 'Talk to sales' }
        ]);
    });

    it('sends text-only welcome as RESPONSE for a new contact', async () => {
        const supabase = createSupabaseMock({
            welcomeConfig: {
                enabled: true,
                message_text: 'Hi {first_name}! Welcome to our page.',
                buttons: []
            }
        });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.getUserProfile.mockResolvedValue({
            id: 'contact_psid_1',
            name: 'Jane Contact',
            profile_pic: 'https://example.com/jane.jpg'
        });

        const response = await POST(createWebhookRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

        const sendArgs = mocks.sendMessage.mock.calls[0];
        expect(sendArgs[3]).toBe('Hi {first_name}! Welcome to our page.');
        expect(sendArgs[4]).toBe('RESPONSE');
        expect(sendArgs[8]).toBeUndefined();
    });
});
