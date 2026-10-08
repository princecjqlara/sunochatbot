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
    analyzeInboundCustomerImages: vi.fn(),
    generateChatbotResponse: vi.fn(),
    handleFollowUpWorkflowContactReply: vi.fn(),
    triggerReplyWorkflowAutomations: vi.fn(),
    stopWorkflowAutomationsFromPageMessage: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({
    getSupabaseAdmin: mocks.getSupabaseAdmin
}));

vi.mock('@/lib/facebook', () => ({
    verifyWebhookSignature: mocks.verifyWebhookSignature,
    generateVerifyToken: mocks.generateVerifyToken,
    sendMessage: mocks.sendMessage,
    sendMessengerMediaAttachment: mocks.sendMessengerMediaAttachment,
    sendMessengerGenericCarousel: mocks.sendMessengerGenericCarousel,
    getUserProfile: mocks.getUserProfile,
    getConversationForPsid: mocks.getConversationForPsid
}));

vi.mock('@/lib/placeholders', () => ({
    replaceTemplateVariables: vi.fn((template: string) => template)
}));

vi.mock('@/lib/chatbot-media', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/chatbot-media')>(),
    analyzeInboundCustomerImages: mocks.analyzeInboundCustomerImages
}));

vi.mock('@/lib/chatbot', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/chatbot')>(),
    generateChatbotResponse: mocks.generateChatbotResponse
}));

vi.mock('@/lib/workflow-automations', () => ({
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
    const contactsSelect = vi.fn().mockReturnValue({ eq: existingContactEqPage });

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

        throw new Error(`Unexpected table: ${table}`);
    });

    return {
        from,
        contactsUpsert
    };
}

function createPhotoChatbotSupabaseMock(options?: { state?: Record<string, unknown>; config?: Record<string, unknown> }) {
    const welcomeSelect = vi.fn(() => {
        throw new Error('Photo chatbot handling should bypass the welcome lookup');
    });
    const chatbotConfig = {
        page_id: 'page_row_1',
        enabled: true,
        trial_mode_enabled: false,
        trial_contact_id: null,
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
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: columns === 'pipeline_stage' ? { pipeline_stage: 'engaged' } : options?.config
                                    ? { id: 'contact_row_1', name: 'Photo Contact', pipeline_stage: 'engaged', profile_pic: null } : null,
                                error: null
                            })
                        })
                    })
                })),
                upsert: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: { id: 'contact_row_1', name: 'Photo Contact', pipeline_stage: 'engaged' },
                            error: null
                        })
                    })
                }),
                update: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
                })
            };
        }
        if (table === 'chatbot_configs') {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: chatbotConfig, error: null })
                    })
                })
            };
        }
        if (table === 'chatbot_follow_up_jobs') {
            return {
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
                insert: vi.fn().mockResolvedValue({ error: null }),
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
        throw new Error(`Unexpected table: ${table}`);
    });

    return { from, welcomeSelect, stateUpsert };
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
    const currentInbound = () => createWebhookRequest({ object: 'page', entry: [{ id: 'fb_page_1', messaging: [{
        sender: { id: 'contact_psid_1' }, recipient: { id: 'fb_page_1' },
        timestamp: Date.parse('2026-10-08T12:00:00Z'), message: { mid: 'mid.goal', text: 'Our new details.' }
    }] }] });
    const activeState = (details: Record<string, string>) => ({ page_id: 'page_row_1', contact_id: 'contact_row_1',
        status: 'active', started_at: '2026-10-08T01:00:00Z', window_expires_at: '2026-10-15T01:00:00Z',
        collected_details: details, missing_details: [], stop_reason: null, stopped_at: null,
        last_inbound_at: null, last_bot_reply_at: null });

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

    it('retains extracted answers and the stop even if the closing delivery fails', async () => {
        const answers = Object.fromEntries(detailFields.slice(0, 6).map(k => [k, 'provided']));
        const supabase = createPhotoChatbotSupabaseMock({ config: goalConfig });
        mocks.getSupabaseAdmin.mockReturnValue(supabase);
        mocks.generateChatbotResponse.mockResolvedValue({ messages: ['Another question?'], collected_details: answers, missing_details: [], details_complete: true });
        mocks.sendMessage.mockRejectedValue(new Error('Delivery failed'));
        expect((await POST(currentInbound())).status).toBe(200);
        expect(supabase.stateUpsert).toHaveBeenCalledWith(expect.objectContaining({ collected_details: answers, status: 'stopped' }), { onConflict: 'page_id,contact_id' });
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
            undefined
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
