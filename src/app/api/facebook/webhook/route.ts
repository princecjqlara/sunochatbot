import { isChatbotHumanPaused, pauseChatbotForHumanTakeover } from '@/lib/chatbot-human-takeover';
import { resolveConversationPriceQuote } from '@/lib/chatbot-conversation-pricing';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyWebhookSignature, sendMessage, sendMessengerGenericCarousel, getConversationForPsid, getUserProfile } from '@/lib/facebook';
import { isExpectedFacebookProfileLookupError } from '@/lib/facebook-errors';
import { replaceTemplateVariables } from '@/lib/placeholders';
import { handleFollowUpWorkflowContactReply, stopWorkflowAutomationsFromPageMessage } from '@/lib/workflow-automations';
import { recordChatbotInterruptionIfNeeded, recordOutboundMessageEvent } from '@/lib/outbound-message-events';
import {
    DEFAULT_CHATBOT_FALLBACK,
    generateChatbotResponse,
    getChatbotGoalClosingMessage,
    getChatbotKnowledgePageId,
    includeKnownContactName,
    splitChatbotMessageBubbles,
    type ChatbotConfig
} from '@/lib/chatbot';
import {
    analyzeInboundCustomerImages,
    createChatbotMediaPublicViewUrl,
    createChatbotMediaSignedUrl,
    getInboundMessengerImageUrls,
    getReadyChatbotMediaForDocuments
} from '@/lib/chatbot-media';
import { getReadyChatbotDriveFilesForDocuments, getReadyChatbotDriveFolderForDocument } from '@/lib/chatbot-drive-folders';
import { cancelPendingChatbotFollowUps, scheduleChatbotFollowUps } from '@/lib/chatbot-follow-ups';
import { recordContactBestTime } from '@/lib/contact-best-time';
import { CHATBOT_BEFORE_DELIVERY_RETRY_PREFIX, claimChatbotReply, finishChatbotReply } from '@/lib/chatbot-replies';
import { isRetryableFacebookSendError } from '@/lib/facebook-send-retry';
import { getChatbotInboundInquiry } from '@/lib/chatbot-inbound';
import { getLiveChatbotLeadStage } from '@/lib/chatbot-lead-stage';
import { collectChatbotFormAnswers, getPrioritizedChatbotForm, isChatbotFormMessage, prioritizesChatbotForm } from '@/lib/chatbot-form-priority';
import { allowsRequestedChatbotRepeat, DuplicateChatbotMessageError, finishChatbotMessage, loadChatbotDeliveryHistory, mergeChatbotDeliveryHistory, reserveChatbotMessage } from '@/lib/chatbot-message-delivery';
import {
    classifyChatbotStopIntent,
    filterChatbotConversationHistory,
    getChatbotContactState,
    getChatbotStateStopReason,
    getMissingChatbotDetails,
    hasReachedChatbotDetailTarget,
    isChatbotContactAllowed,
    saveChatbotContactState,
    type ChatbotContactState,
    type ChatbotStopReason
} from '@/lib/chatbot-control';
import {
    isPipelineClosedForAutomation,
    pipelineStageForChatbotProgress,
    updateContactPipelineStage
} from '@/lib/contact-pipeline';
import { composeContactName, hasUsableContactName, normalizeContactName, pickPreferredContactName } from '../../../../lib/contact-names';
import { findLatestMessengerLeadStageEvent, findLatestMessengerAutomationStop, getMessengerLeadStageName } from '@/lib/messaging-auto-tag';

const PROFILE_LOOKUP_FAILURE_TTL_MS = 60 * 60 * 1000;
const CONTACT_NAME_LOOKUP_TIMEOUT_MS = 2500;
const profileLookupSuppressedUntil = new Map<string, number>();

function chatbotStopReasonForPipelineStage(stage: unknown): ChatbotStopReason | null {
    if (stage === 'qualified') return 'qualified';
    if (stage === 'order_created') return 'order_created';
    if (stage === 'converted') return 'converted';
    if (stage === 'not_qualified') return 'not_qualified';
    if (stage === 'opted_out') return 'opt_out';
    return null;
}

function isProfileLookupSuppressed(pageId: string, senderId: string) {
    const key = `${pageId}:${senderId}`;
    const suppressedUntil = profileLookupSuppressedUntil.get(key) || 0;
    if (suppressedUntil <= Date.now()) {
        profileLookupSuppressedUntil.delete(key);
        return false;
    }

    return true;
}

function suppressProfileLookup(pageId: string, senderId: string) {
    if (profileLookupSuppressedUntil.size >= 5000) {
        const now = Date.now();
        for (const [key, suppressedUntil] of profileLookupSuppressedUntil) {
            if (suppressedUntil <= now) profileLookupSuppressedUntil.delete(key);
        }
    }

    profileLookupSuppressedUntil.set(`${pageId}:${senderId}`, Date.now() + PROFILE_LOOKUP_FAILURE_TTL_MS);
}

// GET /api/facebook/webhook - Verify webhook
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');
    const showToken = searchParams.get('show_token') === 'true';

    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const appId = process.env.FACEBOOK_CLIENT_ID;
    const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN?.trim();

    if (!appSecret || !appId || !verifyToken) {
        return NextResponse.json({ error: 'Facebook app credentials or webhook verify token not configured' }, { status: 500 });
    }

    // Show token in development mode for Facebook webhook setup
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (showToken && isDevelopment) {
        console.log('🔵 Webhook verify token requested (development mode)');
        return NextResponse.json({
            verify_token: verifyToken,
            message: 'Use this token when setting up your Facebook webhook',
            webhook_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/facebook/webhook`,
            app_id: appId,
            environment: 'development'
        });
    }

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('✅ Webhook verified successfully');
        if (isDevelopment) {
            console.log('🔵 Webhook verification details:', {
                mode,
                challenge_length: challenge?.length,
                app_id: appId
            });
        }
        return new NextResponse(challenge, { status: 200 });
    }

    if (isDevelopment) {
        console.warn('⚠️ Webhook verification failed:', {
            mode,
            token_provided: !!token,
            token_match: token === verifyToken
        });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST /api/facebook/webhook - Receive webhook events
export async function POST(request: NextRequest) {
    const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const logPrefix = `[FB_WEBHOOK][${requestId}]`;
    const logInfo = (message: string, data?: unknown) => {
        if (data !== undefined) {
            console.log(`${logPrefix} ${message}`, data);
            return;
        }
        console.log(`${logPrefix} ${message}`);
    };
    const logWarn = (message: string, data?: unknown) => {
        if (data !== undefined) {
            console.warn(`${logPrefix} ${message}`, data);
            return;
        }
        console.warn(`${logPrefix} ${message}`);
    };
    const logError = (message: string, data?: unknown) => {
        if (data !== undefined) {
            console.error(`${logPrefix} ${message}`, data);
            return;
        }
        console.error(`${logPrefix} ${message}`);
    };

    try {
        const body = await request.text();
        const signature = request.headers.get('x-hub-signature-256') || '';
        const appSecret = process.env.FACEBOOK_APP_SECRET!;

        // Verify signature in production only (skip in development for easier testing)
        const isDevelopment = process.env.NODE_ENV !== 'production';
        if (!isDevelopment && appSecret) {
            if (!verifyWebhookSignature(body, signature, appSecret)) {
                logError('Webhook signature verification failed');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
        } else if (isDevelopment) {
            logInfo('Webhook signature verification skipped (development mode)');
        }

        const data = JSON.parse(body);
        const supabase = getSupabaseAdmin();
        let hadCriticalFailure = false;

        let processedEntries = 0;
        let processedEvents = 0;
        let processedContacts = 0;
        let skippedEvents = 0;

        const entryCount = Array.isArray(data.entry) ? data.entry.length : 0;
        logInfo('Webhook payload parsed', {
            object: data.object,
            entryCount,
            bodyLength: body.length,
            signatureProvided: Boolean(signature)
        });

        // Process messaging events
        if (data.object === 'page') {
            for (const entry of data.entry) {
                processedEntries += 1;
                const pageId = entry.id;
                const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : [];
                const standbyEvents = Array.isArray((entry as { standby?: unknown[] }).standby)
                    ? (entry as { standby?: unknown[] }).standby || []
                    : [];

                const inboundEvents = [...messagingEvents, ...standbyEvents];

                if (standbyEvents.length > 0) {
                    logInfo('Received standby events for contact ingestion', {
                        pageId,
                        standbyCount: standbyEvents.length
                    });
                }

                if (inboundEvents.length === 0) {
                    logInfo('Skipping entry with no inbound events', { pageId });
                    continue;
                }

                // Get our page record
                const { data: page, error: pageError } = await supabase
                    .from('pages')
                    .select('id, name, access_token')
                    .eq('fb_page_id', pageId)
                    .single();

                if (pageError) {
                    logError('Failed to fetch page by fb_page_id', {
                        pageId,
                        error: pageError.message
                    });
                    hadCriticalFailure = true;
                    continue;
                }

                if (!page) {
                    logWarn('No internal page record found for webhook entry', { pageId });
                    continue;
                }

                // Fetch welcome message config for this page (cached per webhook batch)
                let welcomeConfig: { enabled: boolean; message_text: string; buttons: Array<{ type: string; text: string; url?: string; payload?: string }> } | null = null;
                let welcomeConfigFetched = false;
                let cachedChatbotConfig: ChatbotConfig | null = null;
                let chatbotConfigFetched = false;
                const loadChatbotConfig = async (): Promise<ChatbotConfig | null> => {
                    if (chatbotConfigFetched) return cachedChatbotConfig;
                    try {
                        const { data: storedChatbotConfig, error: chatbotConfigError } = await supabase
                            .from('chatbot_configs')
                            .select('page_id, updated_at, knowledge_source_page_id, enabled, trial_mode_enabled, trial_contact_id, instructions, fallback_reply, model, rag_enabled, follow_up_prompt, details_to_collect, details_completion_percent, bot_dos, bot_donts, follow_up_enabled, follow_up_quick_delays_minutes, follow_up_best_time_days, follow_up_messages, follow_up_ai_instructions, follow_up_utility_template_name, follow_up_utility_template_language, follow_up_utility_text, follow_up_media_asset_id, split_messages, max_message_parts, stop_when_details_collected, stop_on_opt_out, stop_on_refusal, stop_on_qualified, stop_on_not_qualified, stop_on_converted, stop_on_order_created')
                            .eq('page_id', page.id)
                            .maybeSingle();

                        if (chatbotConfigError) {
                            hadCriticalFailure = true;
                            logWarn('Failed to fetch chatbot config', {
                                pageId,
                                pageDbId: page.id,
                                error: chatbotConfigError.message
                            });
                        } else {
                            cachedChatbotConfig = storedChatbotConfig as ChatbotConfig | null;
                            chatbotConfigFetched = true;
                        }
                    } catch (chatbotConfigError) {
                        hadCriticalFailure = true;
                        logWarn('Chatbot config is unavailable; skipping automatic reply', {
                            pageId,
                            pageDbId: page.id,
                            error: (chatbotConfigError as Error).message
                        });
                    }
                    return cachedChatbotConfig;
                };

                // Process inbound events from both messaging and standby arrays
                if (inboundEvents.length > 0) {
                    for (const event of inboundEvents) {
                        processedEvents += 1;
                        try {
                            const isStandbyEvent = standbyEvents.includes(event);
                            const eventType = event.message
                                ? 'message'
                                : event.postback
                                    ? 'postback'
                                    : event.referral
                                        ? 'referral'
                                        : event.delivery
                                            ? 'delivery'
                                            : event.read
                                                ? 'read'
                                                : event.optin
                                                    ? 'optin'
                                                    : 'unknown';
                            const senderId = event.sender?.id;
                            const recipientId = event.recipient?.id;

                            if (!senderId) {
                                skippedEvents += 1;
                                logWarn('Skipping messaging event without sender id', {
                                    pageId,
                                    recipientId: recipientId ?? null,
                                    eventType,
                                    eventKeys: Object.keys(event || {})
                                });
                                continue;
                            }

                            const isFromContact = senderId !== pageId;

                            // Page echoes can carry the manual workflow stop code.
                            if (!isFromContact) {
                                skippedEvents += 1;
                                const outboundMessageText = typeof event.message?.text === 'string'
                                    ? event.message.text.trim()
                                    : '';

                                const assignedStage = getMessengerLeadStageName(outboundMessageText);
                                if (eventType === 'message' && assignedStage && recipientId) {
                                    const stageStop = findLatestMessengerAutomationStop([
                                        { message: outboundMessageText, from: { id: pageId } }
                                    ], pageId);
                                    if (stageStop) {
                                        try {
                                            const { data: stageContact, error: stageContactError } = await supabase.from('contacts')
                                                .upsert({ page_id: page.id, psid: recipientId }, { onConflict: 'page_id,psid' })
                                                .select('id').single();
                                            if (stageContactError || !stageContact) throw stageContactError || new Error('Lead contact unavailable');
                                            const existingState = await getChatbotContactState(supabase, page.id, stageContact.id);
                                            if (existingState?.history_start_at && Number(event.timestamp) > 0 &&
                                                Number(event.timestamp) < Date.parse(existingState.history_start_at)) continue;
                                            await saveChatbotContactState(supabase, { pageId: page.id, contactId: stageContact.id,
                                                existingState, stopReason: existingState?.status === 'stopped'
                                                    ? existingState.stop_reason || stageStop : stageStop });
                                            if (stageStop !== 'manual') await updateContactPipelineStage(supabase, {
                                                pageId: page.id, contactId: stageContact.id, stage: stageStop, source: 'messenger' });
                                            await cancelPendingChatbotFollowUps({ supabase, pageId: page.id,
                                                contactId: stageContact.id, reason: 'Lead Center is no longer in Intake' });
                                        } catch (stageError) {
                                            hadCriticalFailure = true;
                                            logWarn('Could not persist lead-stage stop; requesting redelivery', { pageId,
                                                error: stageError instanceof Error ? stageError.message : String(stageError) });
                                        }
                                    }
                                }

                                if (!assignedStage && eventType === 'message' && event.message?.is_echo && !event.message.app_id &&
                                    event.message.mid && recipientId) {
                                    try {
                                        const known = await supabase.from('outbound_message_events').select('source_type')
                                            .eq('page_id', page.id).eq('message_id', event.message.mid).maybeSingle();
                                        if (known.error) throw known.error;
                                        if (!known.data || known.data.source_type === 'manual') {
                                            const contactResult = await supabase.from('contacts')
                                                .upsert({ page_id: page.id, psid: recipientId }, { onConflict: 'page_id,psid' })
                                                .select('id').single();
                                            if (contactResult.error) throw contactResult.error;
                                            if (contactResult.data) {
                                                const timestamp = Number(event.timestamp);
                                                await pauseChatbotForHumanTakeover(supabase, {
                                                    pageId: page.id, contactId: contactResult.data.id,
                                                    messageId: event.message.mid, messageText: outboundMessageText,
                                                    takenOverAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : undefined
                                                });
                                            }
                                        }
                                    } catch (takeoverError) {
                                        hadCriticalFailure = true;
                                        logWarn('Could not retain native human takeover; requesting redelivery', { pageId,
                                            error: (takeoverError as Error).message });
                                    }
                                }

                                if (eventType === 'message' && outboundMessageText && recipientId) {
                                    try {
                                        const stopResult = await stopWorkflowAutomationsFromPageMessage({
                                            supabase,
                                            pageId: page.id,
                                            contactPsid: recipientId,
                                            messageText: outboundMessageText
                                        });

                                        if (stopResult.stopped > 0) {
                                            logInfo('Stopped workflow automation from outbound page code', {
                                                pageId,
                                                recipientId,
                                                stopped: stopResult.stopped
                                            });
                                        }
                                    } catch (stopError) {
                                        logWarn('Failed to process outbound workflow stop code', {
                                            pageId,
                                            recipientId,
                                            error: (stopError as Error).message
                                        });
                                    }
                                }

                                if (eventType === 'message' || eventType === 'postback' || eventType === 'referral') {
                                    logInfo('Skipping outbound page event from webhook payload', {
                                        pageId,
                                        senderId,
                                        recipientId: recipientId ?? null,
                                        eventType
                                    });
                                }
                                continue;
                            }

                        let interactionTime = new Date();
                        const rawTimestamp = event.timestamp;
                        if (rawTimestamp !== undefined && rawTimestamp !== null) {
                            let parsedTime: Date | null = null;
                            if (typeof rawTimestamp === 'number' || typeof rawTimestamp === 'string') {
                                const numericTimestamp = Number(rawTimestamp);
                                if (Number.isFinite(numericTimestamp)) {
                                    const candidate = new Date(numericTimestamp);
                                    if (!Number.isNaN(candidate.getTime())) {
                                        parsedTime = candidate;
                                    }
                                }

                                if (!parsedTime) {
                                    const candidate = new Date(rawTimestamp);
                                    if (!Number.isNaN(candidate.getTime())) {
                                        parsedTime = candidate;
                                    }
                                }
                            }

                            if (parsedTime) {
                                interactionTime = parsedTime;
                            } else {
                                logWarn('Invalid webhook event timestamp; using server time fallback', {
                                    pageId,
                                    senderId,
                                    eventType,
                                    rawTimestamp
                                });
                            }
                        } else {
                            logWarn('Webhook event missing timestamp; using server time fallback', {
                                pageId,
                                senderId,
                                eventType
                            });
                        }

                        const interactionAt = interactionTime.toISOString();
                        const inboundInquiry = getChatbotInboundInquiry(event, {
                            facebookPageId: pageId, senderId, entryTimestamp: entry.time
                        });
                        const isCustomerInquiry = Boolean(inboundInquiry);

                        // Check if contact exists BEFORE upsert (to detect new contacts)
                        const { data: existingContact, error: existingContactError } = await supabase
                            .from('contacts')
                            .select('id, name, last_inbound_at, best_contact_hour, pipeline_stage, pipeline_stage_source')
                            .eq('page_id', page.id)
                            .eq('psid', senderId)
                            .maybeSingle();

                        if (existingContactError) {
                            logError('Failed to check existing contact before upsert', {
                                pageId,
                                senderId,
                                error: existingContactError.message
                            });
                            hadCriticalFailure = true;
                            continue;
                        }

                        const isNewContact = !existingContact;
                        const missingName = !hasUsableContactName(existingContact?.name);
                        const eventSenderName = normalizeContactName(event.sender?.name);
                        const shouldRefreshProfile =
                            (isNewContact || missingName) &&
                            !isProfileLookupSuppressed(page.id, senderId);

                        let profileName: string | null = null;
                        let conversationName: string | null = null;
                        let profilePic: string | null = null;
                        let resolvedConversation: Awaited<ReturnType<typeof getConversationForPsid>> = null;

                        if (shouldRefreshProfile) {
                            try {
                                const profile = await getUserProfile(senderId, page.access_token, {
                                    timeoutMs: CONTACT_NAME_LOOKUP_TIMEOUT_MS
                                });
                                profileName = normalizeContactName(profile.name);

                                profileName = pickPreferredContactName(
                                    profileName,
                                    composeContactName(profile.first_name, profile.last_name)
                                );

                                profilePic = typeof profile.profile_pic === 'string' ? profile.profile_pic.trim() || null : null;
                            } catch (profileError) {
                                const profileErrorMessage = (profileError as Error).message || String(profileError);
                                if (isExpectedFacebookProfileLookupError(profileErrorMessage)) {
                                    suppressProfileLookup(page.id, senderId);
                                } else {
                                    logWarn('Failed to fetch profile for contact enrichment', {
                                        pageId,
                                        senderId,
                                        isNewContact,
                                        missingName,
                                        error: profileErrorMessage
                                    });
                                }
                            }
                        }

                        if ((isNewContact || missingName) && !profileName && !eventSenderName) {
                            try {
                                resolvedConversation = await getConversationForPsid(
                                    pageId,
                                    senderId,
                                    page.access_token,
                                    { throwOnError: true, timeoutMs: CONTACT_NAME_LOOKUP_TIMEOUT_MS }
                                );
                                conversationName = pickPreferredContactName(
                                    ...(resolvedConversation?.participants?.data || [])
                                        .filter((participant) => participant.id === senderId)
                                        .map((participant) => participant.name),
                                    ...(resolvedConversation?.messages?.data || [])
                                        .filter((message) => message.from?.id === senderId)
                                        .map((message) => message.from?.name)
                                );
                            } catch (conversationError) {
                                logWarn('Failed to fetch conversation name for contact enrichment', {
                                    pageId,
                                    senderId,
                                    error: (conversationError as Error).message || String(conversationError)
                                });
                            }
                        }

                        const resolvedName = pickPreferredContactName(
                            profileName,
                            eventSenderName,
                            conversationName,
                            existingContact?.name
                        );
                        const existingNameShouldBeCleared =
                            typeof existingContact?.name === 'string' &&
                            !hasUsableContactName(existingContact.name);

                        const contactPayload: Record<string, unknown> = {
                            page_id: page.id,
                            psid: senderId,
                            ...(resolvedName ? { name: resolvedName } : existingNameShouldBeCleared ? { name: null } : {}),
                            ...(profilePic ? { profile_pic: profilePic } : {}),
                            last_interaction_at: interactionAt,
                            ...(isCustomerInquiry && (
                                !existingContact?.last_inbound_at ||
                                new Date(existingContact.last_inbound_at).getTime() < interactionTime.getTime()
                            ) ? { last_inbound_at: interactionAt } : {}),
                            updated_at: new Date().toISOString(),
                            ...(isNewContact ? { first_interaction_at: interactionAt } : {})
                        };

                        let { data: contact, error: contactUpsertError } = await supabase
                            .from('contacts')
                            .upsert(contactPayload, {
                                onConflict: 'page_id,psid'
                            })
                            .select('id, name, best_contact_hour, pipeline_stage, pipeline_stage_source')
                            .single();

                        if (
                            contactUpsertError &&
                            isNewContact &&
                            Object.prototype.hasOwnProperty.call(contactPayload, 'first_interaction_at') &&
                            /first_interaction_at/i.test(contactUpsertError.message || '')
                        ) {
                            const { first_interaction_at: _ignored, ...legacyContactPayload } = contactPayload;

                            logWarn('Retrying contact upsert without first_interaction_at due to schema mismatch', {
                                pageId,
                                senderId,
                                error: contactUpsertError.message
                            });
                            const retryResult = await supabase
                                .from('contacts')
                                .upsert(legacyContactPayload, {
                                    onConflict: 'page_id,psid'
                                })
                                .select('id, name, best_contact_hour, pipeline_stage, pipeline_stage_source')
                                .single();

                            contact = retryResult.data;
                            contactUpsertError = retryResult.error;
                        }

                        if (contactUpsertError && isNewContact) {
                            const { first_interaction_at: _ignored, ...insertContactPayload } = contactPayload;

                            logWarn('Upsert failed for new contact, retrying with direct insert', {
                                pageId,
                                senderId,
                                error: contactUpsertError.message
                            });
                            const insertResult = await supabase
                                .from('contacts')
                                .insert(insertContactPayload)
                                .select('id, name, best_contact_hour, pipeline_stage, pipeline_stage_source')
                                .single();

                            contact = insertResult.data;
                            contactUpsertError = insertResult.error;
                        }

                        if (contactUpsertError) {
                            logError('Failed to create or update contact from webhook', {
                                pageId,
                                senderId,
                                error: contactUpsertError.message
                            });
                            hadCriticalFailure = true;
                            continue;
                        }

                        processedContacts += 1;
                        let welcomeMessageSent = false;
                        let conversationHistoryUnavailable = false;
                        const inboundMessageText = inboundInquiry?.text || '';
                        const inboundImageUrls = getInboundMessengerImageUrls(event.message);

                        const configForInboundInquiry = isCustomerInquiry &&
                            !isStandbyEvent
                            ? await loadChatbotConfig()
                            : null;
                        const chatbotWillHandleInboundInquiry = Boolean(
                            contact && configForInboundInquiry?.enabled &&
                            isChatbotContactAllowed(configForInboundInquiry, contact.id)
                        );

                        // A contact can be new to our database while already having an
                        // existing Messenger thread. Read that thread before treating
                        // the person as a brand-new conversation.
                        if (isNewContact && !resolvedConversation) {
                            try {
                                resolvedConversation = await getConversationForPsid(
                                    pageId,
                                    senderId,
                                    page.access_token,
                                    { throwOnError: true, timeoutMs: 5000 }
                                );
                            } catch (conversationError) {
                                conversationHistoryUnavailable = true;
                                logWarn('Could not verify conversation history for new contact; skipping welcome safely', {
                                    pageId,
                                    senderId,
                                    error: (conversationError as Error).message || String(conversationError)
                                });
                            }
                        }

                        const currentInboundMessageId = typeof event.message?.mid === 'string'
                            ? event.message.mid.trim()
                            : '';
                        const hasPriorConversation = (resolvedConversation?.messages?.data || []).some((message) =>
                            !currentInboundMessageId || message.id !== currentInboundMessageId
                        );

                        // Send welcome message to new contacts
                        if (
                            isNewContact &&
                            isCustomerInquiry &&
                            !isStandbyEvent &&
                            contact &&
                            !hasPriorConversation &&
                            !conversationHistoryUnavailable &&
                            !chatbotWillHandleInboundInquiry
                        ) {
                            // Lazy-load welcome config once per page per webhook batch
                            if (!welcomeConfigFetched) {
                                const { data: wc, error: welcomeConfigError } = await supabase
                                    .from('welcome_messages')
                                    .select('enabled, message_text, buttons')
                                    .eq('page_id', page.id)
                                    .maybeSingle();

                                if (welcomeConfigError) {
                                    logWarn('Failed to fetch welcome message config', {
                                        pageId,
                                        pageDbId: page.id,
                                        error: welcomeConfigError.message
                                    });
                                } else {
                                    welcomeConfig = wc;
                                }
                                welcomeConfigFetched = true;
                            }

                            if (welcomeConfig?.enabled && welcomeConfig.message_text?.trim()) {
                                // Personalize the message
                                const contactName = (contact as { id: string; name?: string }).name || '';

                                let welcomeText = replaceTemplateVariables(welcomeConfig.message_text, {
                                    id: (contact as { id: string }).id || '',
                                    psid: senderId,
                                    page_id: page.id,
                                    name: contactName,
                                    last_interaction_at: null
                                });

                                const mappedWelcomeButtons = Array.isArray(welcomeConfig.buttons)
                                    ? welcomeConfig.buttons
                                        .map((button) => {
                                            const text = typeof button?.text === 'string' ? button.text.trim() : '';
                                            if (!text) return null;

                                            const buttonType = typeof button?.type === 'string' ? button.type.toUpperCase() : 'URL';
                                            if (buttonType === 'QUICK_REPLY') {
                                                const payload = typeof button?.payload === 'string' && button.payload.trim().length > 0
                                                    ? button.payload.trim()
                                                    : text;
                                                return {
                                                    type: 'POSTBACK' as const,
                                                    text,
                                                    payload
                                                };
                                            }

                                            const url = typeof button?.url === 'string' ? button.url.trim() : '';
                                            if (!url) return null;

                                            return {
                                                type: 'URL' as const,
                                                text,
                                                url
                                            };
                                        })
                                        .filter((button): button is { type: 'URL'; text: string; url: string } | { type: 'POSTBACK'; text: string; payload: string } => button !== null)
                                        .slice(0, 3)
                                    : [];

                                const welcomeMessagingType = 'RESPONSE';

                                // Send welcome message (must await in serverless environment)
                                try {
                                    const assertWelcomeAllowed = async () => {
                                        const state = await getChatbotContactState(supabase, page.id, contact!.id);
                                        const liveStage = await getLiveChatbotLeadStage({ facebookPageId: pageId,
                                            psid: senderId, accessToken: page.access_token, historyStartAt: state?.history_start_at });
                                        const { data: currentContact, error } = await supabase.from('contacts')
                                            .select('pipeline_stage').eq('id', contact!.id).eq('page_id', page.id).maybeSingle();
                                        if (error) throw error;
                                        if (!currentContact || liveStage || state?.status === 'stopped' || isChatbotHumanPaused(state) ||
                                            isPipelineClosedForAutomation(currentContact.pipeline_stage)) {
                                            throw new Error('Welcome suppressed because lead stage or conversation changed');
                                        }
                                    };
                                    await assertWelcomeAllowed();
                                    const sendResult = await sendMessage(
                                        pageId,
                                        page.access_token,
                                        senderId,
                                        welcomeText,
                                        welcomeMessagingType,
                                        undefined,
                                        undefined,
                                        undefined,
                                        mappedWelcomeButtons.length > 0 ? mappedWelcomeButtons : undefined,
                                        undefined, assertWelcomeAllowed
                                    );
                                    await recordOutboundMessageEvent(supabase, {
                                        pageId: page.id,
                                        contactId: (contact as { id: string }).id,
                                        messageId: sendResult.message_id,
                                        sourceType: 'welcome',
                                        sourceName: 'Welcome message',
                                        messageKind: welcomeMessagingType
                                    });
                                    welcomeMessageSent = true;
                                    logInfo('Welcome message sent to new contact', {
                                        pageId,
                                        senderId,
                                        messagingType: welcomeMessagingType,
                                        buttonCount: mappedWelcomeButtons.length
                                    });
                                } catch (err) {
                                    logError('Failed to send welcome message', {
                                        pageId,
                                        senderId,
                                        error: (err as Error).message
                                    });
                                }
                            }
                        }

                        // Record interaction for best time to contact analysis
                        if (contact) {
                            try {
                                const bestHour = await recordContactBestTime({ supabase, pageId: page.id,
                                    contactId: contact.id, interactionTime });
                                contact.best_contact_hour = bestHour;
                            } catch (bestTimeError) {
                                logWarn('Could not refresh contact best time before scheduling', {
                                    pageId, contactId: contact.id, error: (bestTimeError as Error).message
                                });
                            }
                            // Attachments are replies too. The workflow handler
                            // does not require text, so schedule/reset on every
                            // inbound message rather than text-only messages.
                            if (isCustomerInquiry) {
                                try {
                                    await cancelPendingChatbotFollowUps({
                                        supabase,
                                        pageId: page.id,
                                        contactId: contact.id,
                                        reason: 'Customer replied',
                                        now: interactionTime
                                    });
                                } catch (followUpCancelError) {
                                    logWarn('Could not cancel pending chatbot follow-ups', {
                                        pageId,
                                        senderId,
                                        contactId: contact.id,
                                        error: (followUpCancelError as Error).message
                                    });
                                }

                                try {
                                    const pipelineClosed = isPipelineClosedForAutomation(
                                        (contact as { pipeline_stage?: unknown }).pipeline_stage
                                    );
                                    const workflowResult = pipelineClosed
                                        ? { scheduled: 0, continued: 0, reset: 0, stopped: 0, errors: 0 }
                                        : await handleFollowUpWorkflowContactReply({
                                        supabase,
                                        page: {
                                            id: page.id,
                                            fb_page_id: pageId,
                                            access_token: page.access_token
                                        },
                                        contact: {
                                            id: contact.id,
                                            psid: senderId,
                                            page_id: page.id,
                                            name: (contact as { name?: string | null }).name || null,
                                            last_interaction_at: interactionAt
                                        },
                                        messageText: inboundMessageText,
                                        interactionAt
                                        });

                                    if (
                                        workflowResult.scheduled > 0 ||
                                        workflowResult.continued > 0 ||
                                        workflowResult.reset > 0 ||
                                        workflowResult.stopped > 0 ||
                                        workflowResult.errors > 0
                                    ) {
                                        logInfo('Processed follow-up workflow automations', {
                                            pageId,
                                            senderId,
                                            contactId: contact.id,
                                            ...workflowResult
                                        });
                                    }
                                } catch (workflowError) {
                                    logWarn('Failed to process follow-up workflow automations', {
                                        pageId,
                                        senderId,
                                        contactId: contact.id,
                                        error: (workflowError as Error).message
                                    });
                                }
                            }

                            const inboundMessageId = inboundInquiry?.id || '';

                            if (
                                isCustomerInquiry &&
                                (inboundMessageText || inboundImageUrls.length > 0) &&
                                inboundMessageId &&
                                !isStandbyEvent &&
                                !welcomeMessageSent
                            ) {
                                const chatbotConfig = await loadChatbotConfig();

                                if (chatbotConfig?.enabled && isChatbotContactAllowed(chatbotConfig, contact.id)) {
                                    let chatbotState: ChatbotContactState | null = null;
                                    let liveStageStopReason: ChatbotStopReason | null = null;
                                    let conversationAuditFailed = false;
                                    try {
                                        chatbotState = await getChatbotContactState(supabase, page.id, contact.id);
                                        if (!resolvedConversation) {
                                            resolvedConversation = await getConversationForPsid(
                                                pageId,
                                                senderId,
                                                page.access_token,
                                                { throwOnError: true, timeoutMs: 5000 }
                                            );
                                        }
                                        const conversationMessages = filterChatbotConversationHistory(
                                            resolvedConversation?.messages?.data || [], chatbotState?.history_start_at
                                        );
                                        const liveLeadStageEvent = findLatestMessengerLeadStageEvent(
                                            conversationMessages,
                                            pageId
                                        );
                                        liveStageStopReason = await getLiveChatbotLeadStage({
                                            facebookPageId: pageId, psid: senderId, accessToken: page.access_token,
                                            historyStartAt: chatbotState?.history_start_at, conversation: resolvedConversation
                                        });
                                        if (liveLeadStageEvent) {
                                            try {
                                                await recordChatbotInterruptionIfNeeded(supabase, {
                                                    pageId: page.id,
                                                    contactId: contact.id,
                                                    messageId: liveLeadStageEvent.messageId,
                                                    source: 'business_suite',
                                                    interruptionType: 'lead_stage_change',
                                                    leadStage: pipelineStageForChatbotProgress({
                                                        stopReason: liveLeadStageEvent.signal
                                                    }),
                                                    interruptedAt: liveLeadStageEvent.createdTime || undefined
                                                });
                                            } catch (interruptionError) {
                                                logWarn('Could not record lead-stage bot interruption', {
                                                    pageId,
                                                    senderId,
                                                    contactId: contact.id,
                                                    error: (interruptionError as Error).message
                                                });
                                            }
                                        }
                                        if (liveStageStopReason) {
                                            if (liveStageStopReason === 'manual' && chatbotState?.status !== 'stopped') {
                                                await saveChatbotContactState(supabase, { pageId: page.id, contactId: contact.id,
                                                    existingState: chatbotState, stopReason: 'manual' });
                                            }
                                            if (liveStageStopReason !== 'manual') await updateContactPipelineStage(supabase, {
                                                pageId: page.id,
                                                contactId: contact.id,
                                                stage: liveStageStopReason,
                                                source: 'messenger',
                                                now: interactionTime
                                            });
                                        }
                                    } catch (conversationError) {
                                        conversationAuditFailed = true;
                                        hadCriticalFailure = true;
                                        logWarn('Could not verify live Lead Center stage; skipping automatic reply safely', {
                                            pageId,
                                            senderId,
                                            contactId: contact.id,
                                            error: (conversationError as Error).message || String(conversationError)
                                        });
                                    }

                                    const inboundBeforeReset = chatbotState?.history_start_at &&
                                        interactionTime.getTime() < Date.parse(chatbotState.history_start_at);
                                    // A closed lead stays with the team, including leads qualified
                                    // by the bot itself. New inbound messages do not reopen it.
                                    const replyConfig: ChatbotConfig = chatbotConfig;
                                    let stateStopReason: ChatbotStopReason | null = conversationAuditFailed || inboundBeforeReset || isChatbotHumanPaused(chatbotState)
                                        ? 'manual'
                                        : chatbotStopReasonForPipelineStage(
                                            (contact as { pipeline_stage?: unknown }).pipeline_stage
                                        ) || liveStageStopReason;
                                    try {
                                        const storedStopReason = getChatbotStateStopReason(chatbotState, interactionTime);
                                        if (storedStopReason === 'window_expired') {
                                            // A fresh customer message opens a new seven-day activity window.
                                            // Other stop reasons remain durable until manually reset.
                                            chatbotState = chatbotState ? {
                                                ...chatbotState,
                                                status: 'active',
                                                started_at: interactionAt,
                                                stop_reason: null,
                                                stopped_at: null,
                                                last_inbound_at: interactionAt
                                            } : null;
                                        } else if (!stateStopReason) {
                                            stateStopReason = storedStopReason;
                                        }
                                        stateStopReason = classifyChatbotStopIntent(inboundMessageText, {
                                                stopOnOptOut: chatbotConfig.stop_on_opt_out,
                                                stopOnRefusal: chatbotConfig.stop_on_refusal
                                            }) || stateStopReason;
                                        if (!stateStopReason && chatbotConfig.stop_when_details_collected &&
                                            hasReachedChatbotDetailTarget(chatbotConfig, chatbotState?.collected_details)) {
                                            stateStopReason = 'details_collected';
                                        }

                                        if (
                                            stateStopReason &&
                                            stateStopReason !== 'manual' &&
                                            (chatbotState?.status !== 'stopped' ||
                                                chatbotState.stop_reason !== stateStopReason)
                                        ) {
                                            await saveChatbotContactState(supabase, {
                                                pageId: page.id,
                                                contactId: contact.id,
                                                existingState: chatbotState,
                                                collectedDetails: chatbotState?.collected_details || {},
                                                missingDetails: getMissingChatbotDetails(
                                                    chatbotConfig.details_to_collect,
                                                    chatbotState?.collected_details || {}
                                                ),
                                                inboundAt: interactionAt,
                                                stopReason: stateStopReason,
                                                now: interactionTime
                                            });
                                        }
                                    } catch (stateError) {
                                        hadCriticalFailure = true;
                                        stateStopReason = 'manual';
                                        logWarn('Chatbot state is unavailable; skipping automatic reply safely', {
                                            pageId,
                                            senderId,
                                            error: (stateError as Error).message
                                        });
                                    }

                                    if (stateStopReason !== 'manual' && stateStopReason !== 'window_expired') {
                                        try {
                                            await updateContactPipelineStage(supabase, {
                                                pageId: page.id,
                                                contactId: contact.id,
                                                stage: pipelineStageForChatbotProgress({
                                                    stopReason: stateStopReason,
                                                    collectedDetails: chatbotState?.collected_details || {}
                                                }),
                                                source: 'chatbot',
                                                now: interactionTime
                                            });
                                        } catch (pipelineError) {
                                            logWarn('Could not update chatbot contact pipeline stage', {
                                                pageId,
                                                senderId,
                                                contactId: contact.id,
                                                error: (pipelineError as Error).message
                                            });
                                        }
                                    }

                                    if (stateStopReason) {
                                        logInfo('Chatbot reply skipped by stop rule', {
                                            pageId,
                                            senderId,
                                            contactId: contact.id,
                                            reason: stateStopReason
                                        });
                                    }

                                    let claimed = false;
                                    if (!stateStopReason) {
                                        try {
                                            claimed = await claimChatbotReply(supabase, {
                                                inboundMessageId,
                                                pageId: page.id,
                                                contactId: contact.id
                                            });
                                        } catch (claimError) {
                                            hadCriticalFailure = true;
                                            logWarn('Could not claim chatbot reply', {
                                                pageId,
                                                senderId,
                                                inboundMessageId,
                                                error: (claimError as Error).message
                                            });
                                        }
                                    }

                                    if (claimed) {
                                        let lastOutboundMessageId: string | undefined;
                                        let deliveryAttempted = false;
                                        let scheduleAllowedFollowUps: (() => Promise<void>) | undefined;
                                        try {
                                            const fallbackReply = chatbotConfig.fallback_reply?.trim() || DEFAULT_CHATBOT_FALLBACK;
                                            let replyMessages = splitChatbotMessageBubbles(fallbackReply, chatbotConfig.split_messages);
                                            let collectedDetails = includeKnownContactName(chatbotConfig.details_to_collect,
                                                collectChatbotFormAnswers({ config: chatbotConfig, pageId, inboundMessage: inboundMessageText,
                                                    history: filterChatbotConversationHistory(resolvedConversation?.messages?.data || [], chatbotState?.history_start_at),
                                                    collectedDetails: chatbotState?.collected_details }), (contact as { name?: string | null }).name);
                                            let missingDetails = getMissingChatbotDetails(
                                                chatbotConfig.details_to_collect,
                                                collectedDetails
                                            );
                                            let generatedStopReason: ChatbotStopReason | null = null;
                                            let detailsComplete = false;
                                            let replySuppressed = false;
                                            let generatedMediaDocumentIds: string[] = [];
                                            let generatedDriveFileDocumentIds: string[] = [];
                                            let generatedLinkDocumentId: string | undefined;
                                            let replyHistory = filterChatbotConversationHistory(resolvedConversation?.messages?.data || [], chatbotState?.history_start_at);
                                            try {
                                                replyHistory = mergeChatbotDeliveryHistory(replyHistory, await loadChatbotDeliveryHistory({
                                                    supabase, pageId: page.id, contactId: contact.id, facebookPageId: pageId,
                                                    historyStartAt: chatbotState?.history_start_at
                                                }));
                                                let chatbotInboundMessage = inboundMessageText;
                                                if (inboundImageUrls.length > 0) {
                                                    try {
                                                        const visualSummary = await analyzeInboundCustomerImages({
                                                            imageUrls: inboundImageUrls,
                                                            caption: inboundMessageText
                                                        });
                                                        chatbotInboundMessage = [
                                                            inboundMessageText
                                                                ? `Customer message: ${inboundMessageText}`
                                                                : 'The customer sent one or more photos without a text caption.',
                                                            `Visual analysis of the customer photos: ${visualSummary}`
                                                        ].join('\n\n');
                                                    } catch (photoAnalysisError) {
                                                        logWarn('Could not analyze inbound customer photos; replying with safe image context', {
                                                            pageId,
                                                            senderId,
                                                            imageCount: inboundImageUrls.length,
                                                            error: (photoAnalysisError as Error).message
                                                        });
                                                        chatbotInboundMessage = inboundMessageText ||
                                                            'The customer sent one or more photos without a text caption, but the visual content could not be read reliably. Acknowledge the photos and ask one concise clarifying question.';
                                                    }
                                                }
                                                const conversationPriceQuote = await resolveConversationPriceQuote({
                                                    supabase, pageId: page.id, facebookPageId: pageId, contactId: contact.id,
                                                    history: filterChatbotConversationHistory(resolvedConversation?.messages?.data || [], chatbotState?.history_start_at),
                                                    state: chatbotState
                                                });
                                                const generated = await generateChatbotResponse({
                                                    conversationPriceQuote,
                                                    formSentAt: chatbotState?.form_sent_at,
                                                    config: replyConfig,
                                                    contactName: (contact as { name?: string | null }).name,
                                                    pageName: page.name,
                                                    pageId,
                                                    inboundMessage: chatbotInboundMessage,
                                                    history: replyHistory,
                                                    collectedDetails
                                                });
                                                replyMessages = generated.messages;
                                                replySuppressed = Boolean(generated.reply_suppressed);
                                                collectedDetails = collectChatbotFormAnswers({ config: chatbotConfig, pageId,
                                                    inboundMessage: inboundMessageText,
                                                    collectedDetails: { ...collectedDetails, ...generated.collected_details } });
                                                missingDetails = getMissingChatbotDetails(chatbotConfig.details_to_collect, collectedDetails);
                                                detailsComplete = hasReachedChatbotDetailTarget(chatbotConfig, collectedDetails);
                                                generatedMediaDocumentIds = generated.media_document_ids?.length
                                                    ? generated.media_document_ids
                                                    : generated.media_document_id
                                                        ? [generated.media_document_id]
                                                        : [];
                                                generatedDriveFileDocumentIds = generated.drive_file_document_ids || [];
                                                generatedLinkDocumentId = generated.link_document_id;
                                                if (
                                                    generated.detected_stop_reason === 'opt_out' &&
                                                    chatbotConfig.stop_on_opt_out
                                                ) {
                                                    generatedStopReason = 'opt_out';
                                                } else if (
                                                    generated.detected_stop_reason === 'refusal' &&
                                                    chatbotConfig.stop_on_refusal
                                                ) {
                                                    generatedStopReason = 'refusal';
                                                } else if (
                                                    detailsComplete &&
                                                    chatbotConfig.stop_when_details_collected
                                                ) {
                                                    generatedStopReason = 'details_collected';
                                                    replyMessages = [getChatbotGoalClosingMessage(chatbotConfig.instructions, inboundMessageText)];
                                                    replySuppressed = false;
                                                }
                                            } catch (generationError) {
                                                logWarn('AI reply generation failed; using chatbot fallback', {
                                                    pageId,
                                                    senderId,
                                                    error: (generationError as Error).message
                                                });
                                                const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
                                                const priorReplies = replyHistory
                                                    .filter(message => message.from?.id === pageId)
                                                    .map(message => normalize(message.message || ''));
                                                replyMessages = replyMessages.filter(message => !priorReplies.includes(normalize(message)));
                                                replySuppressed = replyMessages.length === 0;
                                            }

                                            detailsComplete = hasReachedChatbotDetailTarget(chatbotConfig, collectedDetails);
                                            if (detailsComplete && chatbotConfig.stop_when_details_collected && !generatedStopReason) {
                                                generatedStopReason = 'details_collected';
                                                replyMessages = [getChatbotGoalClosingMessage(chatbotConfig.instructions, inboundMessageText)];
                                                replySuppressed = false;
                                            }
                                            const hasEarlierPageReply = filterChatbotConversationHistory(
                                                resolvedConversation?.messages?.data || [], chatbotState?.history_start_at
                                            ).some(message => message.from?.id === pageId && message.message?.trim());
                                            if (!replyMessages.length && !generatedStopReason && !hasEarlierPageReply) {
                                                // An invalid first generation must not leave a new inquiry silent.
                                                replyMessages = splitChatbotMessageBubbles(fallbackReply, chatbotConfig.split_messages);
                                                replySuppressed = false;
                                            }

                                            if (generatedStopReason === 'opt_out' || generatedStopReason === 'refusal') {
                                                replyMessages = [];
                                            }
                                            const priorityForm = getPrioritizedChatbotForm({ config: chatbotConfig, pageId,
                                                formSentAt: chatbotState?.form_sent_at,
                                                inboundMessage: inboundMessageText,
                                                history: replyHistory,
                                                collectedDetails, replyMessages: replySuppressed ? [] : replyMessages,
                                                stopReason: generatedStopReason });
                                            if (priorityForm) {
                                                replyMessages = priorityForm;
                                                replySuppressed = false;
                                                generatedMediaDocumentIds = [];
                                                generatedDriveFileDocumentIds = [];
                                                generatedLinkDocumentId = undefined;
                                            }

                                            if (replyMessages.length === 0 && !generatedStopReason && !replySuppressed) {
                                                throw new Error('Chatbot generated no reply and no fallback is configured');
                                            }

                                            // Generation can take several seconds. Recheck a stop or newly
                                            // completed brief before saving/sending this older turn.
                                            let latestState = await getChatbotContactState(supabase, page.id, contact.id);
                                            const { data: latestConfig, error: latestConfigError } = await supabase.from('chatbot_configs')
                                                .select('*').eq('page_id', page.id).maybeSingle();
                                            if (latestConfigError) throw latestConfigError;
                                            if (!latestConfig?.enabled || !isChatbotContactAllowed(latestConfig, contact.id) ||
                                                (latestConfig.updated_at && chatbotConfig.updated_at && latestConfig.updated_at !== chatbotConfig.updated_at)) {
                                                throw new Error('Reply suppressed because chatbot settings changed during generation');
                                            }
                                            if (latestState && getChatbotStateStopReason(latestState, interactionTime) === 'window_expired') {
                                                latestState = { ...latestState, status: 'active', stop_reason: null,
                                                    stopped_at: null, started_at: interactionAt };
                                            }
                                            const { data: latestContact, error: latestContactError } = await supabase.from('contacts')
                                                .select('pipeline_stage,pipeline_stage_source,last_inbound_at').eq('id', contact.id).eq('page_id', page.id).maybeSingle();
                                            if (latestContactError) throw latestContactError;
                                            const assertLiveStageOpen = async () => {
                                                const currentState = await getChatbotContactState(supabase, page.id, contact.id);
                                                if (Date.parse(currentState?.history_start_at || '') > interactionTime.getTime()) {
                                                    throw new Error('Reply suppressed because the conversation was reset');
                                                }
                                                const liveStop = await getLiveChatbotLeadStage({
                                                    facebookPageId: pageId, psid: senderId, accessToken: page.access_token,
                                                    historyStartAt: currentState?.history_start_at
                                                });
                                                if (!liveStop) return;
                                                await saveChatbotContactState(supabase, { pageId: page.id, contactId: contact.id,
                                                    existingState: currentState, stopReason: liveStop });
                                                if (liveStop !== 'manual') await updateContactPipelineStage(supabase, { pageId: page.id, contactId: contact.id,
                                                    stage: liveStop, source: 'messenger' });
                                                await cancelPendingChatbotFollowUps({ supabase, pageId: page.id,
                                                    contactId: contact.id, reason: 'Lead Center stage changed' });
                                                throw new Error('Reply suppressed because the live Lead Center stage is closed');
                                            };
                                            await assertLiveStageOpen();
                                            if (!latestContact || isChatbotHumanPaused(latestState) ||
                                                latestState?.status === 'stopped' ||
                                                isPipelineClosedForAutomation(latestContact.pipeline_stage) ||
                                                (latestContact?.last_inbound_at && Date.parse(latestContact.last_inbound_at) > interactionTime.getTime()) ||
                                                (latestState?.last_inbound_at && Date.parse(latestState.last_inbound_at) > interactionTime.getTime()) ||
                                                (latestState?.history_start_at && Date.parse(latestState.history_start_at) > interactionTime.getTime()) ||
                                                (chatbotConfig.stop_when_details_collected && hasReachedChatbotDetailTarget(chatbotConfig, latestState?.collected_details))) {
                                                throw new Error('Reply suppressed because a newer customer message, stop, or completed goal superseded this turn');
                                            }
                                            chatbotState = latestState || chatbotState;
                                            collectedDetails = { ...(chatbotState?.collected_details || {}), ...collectedDetails };
                                            missingDetails = getMissingChatbotDetails(chatbotConfig.details_to_collect, collectedDetails);
                                            detailsComplete = hasReachedChatbotDetailTarget(chatbotConfig, collectedDetails);
                                            if (!generatedStopReason && detailsComplete && chatbotConfig.stop_when_details_collected) {
                                                generatedStopReason = 'details_collected';
                                                replyMessages = [getChatbotGoalClosingMessage(chatbotConfig.instructions, inboundMessageText)];
                                                replySuppressed = false;
                                            }
                                            // Save answers and the durable stop before sending so delivery
                                            // failures cannot lose answers or restart the collection flow.
                                            await saveChatbotContactState(supabase, {
                                                pageId: page.id, contactId: contact.id, existingState: chatbotState,
                                                collectedDetails, missingDetails, inboundAt: interactionAt,
                                                stopReason: generatedStopReason
                                            });
                                            // Retain forms sent before this feature while they are still
                                            // visible in history, without marking an unsent generated form.
                                            if (!chatbotState?.form_sent_at && prioritizesChatbotForm(chatbotConfig.instructions)) {
                                                const priorForm = filterChatbotConversationHistory(
                                                    resolvedConversation?.messages?.data || [], chatbotState?.history_start_at
                                                ).find(message => message.from?.id === pageId &&
                                                    isChatbotFormMessage(message.message || '', chatbotConfig) &&
                                                    Number.isFinite(Date.parse(message.created_time || '')));
                                                if (priorForm) {
                                                    const { error } = await supabase.rpc('record_chatbot_form_sent', {
                                                        p_page_id: page.id, p_contact_id: contact.id,
                                                        p_sent_at: priorForm.created_time,
                                                        p_history_start_at: chatbotState?.history_start_at || null
                                                    });
                                                    if (error) throw new Error('Could not retain previous chatbot form delivery');
                                                }
                                            }
                                            const chatbotPipelineStage = pipelineStageForChatbotProgress({ stopReason: generatedStopReason, detailsComplete, collectedDetails });
                                            // Qualification describes the saved answers, even if Messenger
                                            // cannot deliver the closing acknowledgement.
                                            const closingStageWrittenAt = new Date();
                                            const pipelineUpdated = await updateContactPipelineStage(supabase, {
                                                pageId: page.id, contactId: contact.id,
                                                stage: chatbotPipelineStage, source: 'chatbot', now: closingStageWrittenAt
                                            });
                                            if (generatedStopReason || detailsComplete) {
                                                await cancelPendingChatbotFollowUps({ supabase, pageId: page.id,
                                                    contactId: contact.id, reason: 'Contact reached the collection goal or stopped' });
                                            }

                                            let sentMedia = false;
                                            const knowledgePageId = getChatbotKnowledgePageId(chatbotConfig);
                                            let selectedDriveFolder = null;
                                            let selectedDriveFiles = [] as Awaited<ReturnType<typeof getReadyChatbotDriveFilesForDocuments>>;
                                            const assertDeliveryAllowed = async () => {
                                                await assertLiveStageOpen();
                                                const [contactResult, currentState] = await Promise.all([
                                                    supabase.from('contacts').select('pipeline_stage,pipeline_stage_source,pipeline_stage_updated_at,last_inbound_at')
                                                        .eq('id', contact.id).eq('page_id', page.id).maybeSingle(),
                                                    getChatbotContactState(supabase, page.id, contact.id)
                                                ]);
                                                if (contactResult.error) throw contactResult.error;
                                                const currentContact = contactResult.data;
                                                // This turn may send its own goal-closing acknowledgement.
                                                // A stage changed by staff or another turn remains authoritative.
                                                const ownClosingStage = generatedStopReason && pipelineUpdated &&
                                                    currentContact?.pipeline_stage === chatbotPipelineStage &&
                                                    currentContact?.pipeline_stage_source === 'chatbot' &&
                                                    Date.parse(currentContact.pipeline_stage_updated_at || '') === closingStageWrittenAt.getTime();
                                                if (isChatbotHumanPaused(currentState) || !currentContact ||
                                                    (isPipelineClosedForAutomation(currentContact.pipeline_stage) && !ownClosingStage) ||
                                                    (currentState?.status === 'stopped' && currentState.stop_reason !== generatedStopReason) ||
                                                    Date.parse(currentState?.last_inbound_at || '') > interactionTime.getTime() ||
                                                    Date.parse(currentContact.last_inbound_at || '') > interactionTime.getTime() ||
                                                    Date.parse(currentState?.history_start_at || '') > interactionTime.getTime()) {
                                                    throw new Error('Reply delivery stopped because the contact stage or conversation changed');
                                                }
                                            };
                                            if (generatedDriveFileDocumentIds.length > 0 && !generatedStopReason) {
                                                try {
                                                    selectedDriveFiles = await getReadyChatbotDriveFilesForDocuments({
                                                        pageId: knowledgePageId,
                                                        documentIds: generatedDriveFileDocumentIds
                                                    });
                                                } catch (driveFileError) {
                                                    logWarn('Chatbot reply generated but indexed Drive file lookup failed', {
                                                        pageId,
                                                        senderId,
                                                        documentIds: generatedDriveFileDocumentIds,
                                                        error: (driveFileError as Error).message
                                                    });
                                                }
                                            }
                                            if (generatedLinkDocumentId && selectedDriveFiles.length === 0 && !generatedStopReason) {
                                                try {
                                                    selectedDriveFolder = await getReadyChatbotDriveFolderForDocument({
                                                        pageId: knowledgePageId,
                                                        documentId: generatedLinkDocumentId
                                                    });
                                                } catch (folderError) {
                                                    logWarn('Chatbot reply generated but Drive folder lookup failed', {
                                                        pageId,
                                                        senderId,
                                                        documentId: generatedLinkDocumentId,
                                                        error: (folderError as Error).message
                                                    });
                                                }
                                            }
                                            const reserveReply = (message: string, suffix: string) => reserveChatbotMessage({
                                                supabase, pageId: page.id, contactId: contact.id, message,
                                                sourceKey: `reply:${inboundMessageId}:${suffix}`, historyStartAt: chatbotState?.history_start_at,
                                                allowRepeat: allowsRequestedChatbotRepeat(inboundMessageText)
                                            });
                                            scheduleAllowedFollowUps = async () => {
                                                if (generatedStopReason || isPipelineClosedForAutomation(chatbotPipelineStage)) return;
                                                await assertDeliveryAllowed();
                                                await scheduleChatbotFollowUps({
                                                    supabase, pageId: page.id,
                                                    contact: { id: contact.id, page_id: page.id, psid: senderId,
                                                        name: (contact as { name?: string | null }).name || null,
                                                        best_contact_hour: (contact as { best_contact_hour?: number | null }).best_contact_hour,
                                                        last_interaction_at: interactionAt, pipeline_stage: chatbotPipelineStage },
                                                    config: chatbotConfig, anchorInboundAt: interactionAt,
                                                    inboundMessage: inboundMessageText, now: interactionTime
                                                });
                                            };
                                            let replyBatchId: string | null = null;
                                            if (replyMessages.length > 1) {
                                                await assertDeliveryAllowed();
                                                replyBatchId = await reserveReply(replyMessages.join('\n\n'), 'batch');
                                                if (!replyBatchId) throw new DuplicateChatbotMessageError();
                                            }
                                            for (const [messageIndex, replyText] of replyMessages.entries()) {
                                                const isFinalMessage = messageIndex === replyMessages.length - 1;
                                                await assertDeliveryAllowed();
                                                const deliveryId = await reserveReply(replyText.trim(), String(messageIndex));
                                                if (!deliveryId) throw new DuplicateChatbotMessageError();
                                                deliveryAttempted = true;
                                                const sendResult = await sendMessage(
                                                    pageId,
                                                    page.access_token,
                                                    senderId,
                                                    replyText.trim(),
                                                    'RESPONSE',
                                                    undefined,
                                                    undefined,
                                                    undefined,
                                                    isFinalMessage && selectedDriveFolder
                                                        ? [{
                                                            type: 'URL',
                                                            text: selectedDriveFolder.button_text,
                                                            url: selectedDriveFolder.folder_url
                                                        }]
                                                        : undefined,
                                                    undefined,
                                                    assertDeliveryAllowed
                                                );
                                                lastOutboundMessageId = sendResult.message_id;
                                                await finishChatbotMessage({ supabase, deliveryId, messageId: sendResult.message_id });

                                                await recordOutboundMessageEvent(supabase, {
                                                    pageId: page.id,
                                                    contactId: contact.id,
                                                    messageId: sendResult.message_id,
                                                    sourceType: 'chatbot',
                                                    sourceName: replyMessages.length > 1
                                                        ? `AI Chatbot (${messageIndex + 1}/${replyMessages.length})`
                                                        : 'AI Chatbot',
                                                    messageKind: 'RESPONSE'
                                                });
                                                if (prioritizesChatbotForm(chatbotConfig.instructions) && isChatbotFormMessage(replyText, chatbotConfig)) {
                                                    const { error: formError } = await supabase.rpc('record_chatbot_form_sent', {
                                                        p_page_id: page.id, p_contact_id: contact.id,
                                                        p_sent_at: new Date().toISOString(),
                                                        p_history_start_at: chatbotState?.history_start_at || null
                                                    });
                                                    if (formError) throw new Error('Could not retain delivered chatbot form');
                                                }
                                            }

                                            if (replyBatchId && lastOutboundMessageId) {
                                                await finishChatbotMessage({ supabase, deliveryId: replyBatchId, messageId: lastOutboundMessageId });
                                            }

                                            if (selectedDriveFiles.length > 0 && !generatedStopReason) {
                                                await assertDeliveryAllowed();
                                                try {
                                                    deliveryAttempted = true;
                                                    const mediaResult = await sendMessengerGenericCarousel(
                                                        pageId,
                                                        page.access_token,
                                                        senderId,
                                                        selectedDriveFiles.map((file) => ({
                                                            title: file.name,
                                                            subtitle: file.media_type === 'image' ? 'Image sample' : 'Video sample',
                                                            url: file.web_view_url,
                                                            imageUrl: file.thumbnail_url || undefined,
                                                            buttonTitle: file.media_type === 'image' ? 'View image' : 'Watch video'
                                                        })),
                                                        'RESPONSE'
                                                    );
                                                    lastOutboundMessageId = mediaResult.message_id;
                                                    sentMedia = true;
                                                    await recordOutboundMessageEvent(supabase, {
                                                        pageId: knowledgePageId,
                                                        contactId: contact.id,
                                                        messageId: mediaResult.message_id,
                                                        sourceType: 'chatbot',
                                                        sourceName: selectedDriveFiles.length > 1
                                                            ? `AI Chatbot Drive carousel (${selectedDriveFiles.length} cards)`
                                                            : `AI Chatbot Drive card: ${selectedDriveFiles[0].name}`,
                                                        messageKind: selectedDriveFiles.length > 1
                                                            ? `Drive media carousel (${selectedDriveFiles.length} cards)`
                                                            : 'Drive media card'
                                                    });
                                                } catch (driveCarouselError) {
                                                    logWarn('Chatbot text sent but Drive file carousel failed', {
                                                        pageId,
                                                        senderId,
                                                        fileIds: selectedDriveFiles.map((file) => file.drive_file_id),
                                                        error: (driveCarouselError as Error).message
                                                    });
                                                }
                                            }

                                            if (generatedMediaDocumentIds.length > 0 && !generatedStopReason) {
                                                try {
                                                    const mediaItems = await getReadyChatbotMediaForDocuments({
                                                        pageId: knowledgePageId,
                                                        documentIds: generatedMediaDocumentIds
                                                    });
                                                    if (mediaItems.length > 0) {
                                                        const cards = await Promise.all(mediaItems.map(async (media) => {
                                                            const mediaUrl = await createChatbotMediaSignedUrl(media);
                                                            return {
                                                                title: media.title,
                                                                subtitle: media.usage_notes || `${media.media_type === 'image' ? 'Image' : 'Video'} sample`,
                                                                url: createChatbotMediaPublicViewUrl(media.id),
                                                                imageUrl: media.media_type === 'image' ? mediaUrl : undefined,
                                                                buttonTitle: media.media_type === 'image' ? 'View image' : 'Watch video'
                                                            };
                                                        }));
                                                        await assertDeliveryAllowed();
                                                        deliveryAttempted = true;
                                                        const mediaResult = await sendMessengerGenericCarousel(
                                                            pageId,
                                                            page.access_token,
                                                            senderId,
                                                            cards,
                                                            'RESPONSE'
                                                        );
                                                        lastOutboundMessageId = mediaResult.message_id;
                                                        sentMedia = true;
                                                        await recordOutboundMessageEvent(supabase, {
                                                            pageId: page.id,
                                                            contactId: contact.id,
                                                            messageId: mediaResult.message_id,
                                                            sourceType: 'chatbot',
                                                            sourceName: mediaItems.length > 1
                                                                ? `AI Chatbot media carousel (${mediaItems.length} cards)`
                                                                : `AI Chatbot media card: ${mediaItems[0].title}`,
                                                            messageKind: mediaItems.length > 1
                                                                ? `media carousel (${mediaItems.length} cards)`
                                                                : 'media card'
                                                        });
                                                    }
                                                } catch (mediaError) {
                                                    logWarn('Chatbot text sent but media attachment failed', {
                                                        pageId,
                                                        senderId,
                                                        documentIds: generatedMediaDocumentIds,
                                                        error: (mediaError as Error).message
                                                    });
                                                }
                                            }

                                            if (lastOutboundMessageId) {
                                                const { error: replyTimeError } = await supabase.from('chatbot_contact_states')
                                                    .update({ last_bot_reply_at: new Date().toISOString() })
                                                    .eq('page_id', page.id).eq('contact_id', contact.id);
                                                if (replyTimeError) throw replyTimeError;
                                            }

                                            if (
                                                !generatedStopReason &&
                                                !isPipelineClosedForAutomation(chatbotPipelineStage) &&
                                                (replyMessages.length > 0 || sentMedia || replySuppressed)
                                            ) {
                                                await assertDeliveryAllowed();
                                                try {
                                                    await scheduleAllowedFollowUps();
                                                } catch (followUpScheduleError) {
                                                    logWarn('Chatbot reply sent but follow-up scheduling failed', {
                                                        pageId,
                                                        senderId,
                                                        contactId: contact.id,
                                                        error: (followUpScheduleError as Error).message
                                                    });
                                                }
                                            }

                                            await finishChatbotReply(supabase, inboundMessageId, {
                                                status: replySuppressed ? 'failed' : 'sent',
                                                outboundMessageId: lastOutboundMessageId,
                                                ...(replySuppressed ? { error: 'Repetitive reply suppressed; collected answers retained' } : {})
                                            }).catch((finishError) => {
                                                logWarn('Chatbot reply sent but status update failed', {
                                                    pageId,
                                                    inboundMessageId,
                                                    error: (finishError as Error).message
                                                });
                                            });

                                            logInfo(replySuppressed ? 'Repetitive chatbot reply suppressed' : 'Chatbot reply sent', {
                                                pageId,
                                                senderId,
                                                inboundMessageId,
                                                model: chatbotConfig.model,
                                                messageParts: replyMessages.length,
                                                stopReason: generatedStopReason,
                                                missingDetails
                                            });
                                        } catch (chatbotError) {
                                            const failureMessage = (chatbotError as Error).message || String(chatbotError);
                                            const duplicateSuppressed = chatbotError instanceof DuplicateChatbotMessageError;
                                            // The inbound event cancelled the previous sequence. A
                                            // suppressed duplicate answer must not disable reminders.
                                            if (duplicateSuppressed && scheduleAllowedFollowUps) {
                                                try { await scheduleAllowedFollowUps(); }
                                                catch (followUpError) {
                                                    logWarn('Could not retain reminders after duplicate reply suppression', {
                                                        pageId, contactId: contact.id, error: (followUpError as Error).message
                                                    });
                                                }
                                            }
                                            const failedBeforeDelivery = !deliveryAttempted && !lastOutboundMessageId &&
                                                !duplicateSuppressed && !/^Reply (?:suppressed|delivery stopped)\b/.test(failureMessage);
                                            if (!duplicateSuppressed && !lastOutboundMessageId && (failedBeforeDelivery || isRetryableFacebookSendError(chatbotError))) {
                                                hadCriticalFailure = true;
                                            }
                                            await finishChatbotReply(supabase, inboundMessageId, {
                                                status: duplicateSuppressed ? 'sent' : 'failed',
                                                outboundMessageId: lastOutboundMessageId,
                                                error: failedBeforeDelivery ? CHATBOT_BEFORE_DELIVERY_RETRY_PREFIX + failureMessage : failureMessage
                                            }).catch(() => undefined);

                                            logWarn('Failed to send chatbot reply', {
                                                pageId,
                                                senderId,
                                                inboundMessageId,
                                                error: (chatbotError as Error).message
                                            });
                                        }
                                    }
                                }
                            }


                        }
                        } catch (eventError) {
                            skippedEvents += 1;
                            hadCriticalFailure = true;
                            logError('Unhandled exception while processing inbound webhook event', {
                                pageId,
                                senderId: event?.sender?.id ?? null,
                                recipientId: event?.recipient?.id ?? null,
                                eventKeys: Object.keys(event || {}),
                                error: (eventError as Error).message
                            });
                        }
                    }
                }
            }
        } else {
            logWarn('Ignoring webhook payload with unsupported object type', { object: data.object });
        }

        logInfo('Webhook processing summary', {
            processedEntries,
            processedEvents,
            processedContacts,
            skippedEvents,
            hadCriticalFailure
        });

        if (hadCriticalFailure) {
            return NextResponse.json(
                {
                    error: 'Webhook processing partially failed',
                    message: 'One or more contact upserts failed. Returning 500 so Facebook can retry delivery.'
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logError('Unhandled webhook error', {
            error: (error as Error).message
        });
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}
