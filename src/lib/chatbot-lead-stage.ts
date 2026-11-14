import { FacebookGraphApiError, getConversationForPsid, getConversationMessages, getMessengerContactLabels } from '@/lib/facebook';
import { filterChatbotConversationHistory } from '@/lib/chatbot-control';
import { findLatestMessengerAutomationStop, findMessengerLabelAutomationStop } from '@/lib/messaging-auto-tag';
import type { FacebookConversation } from '@/types';

/** Audit Lead Center independently of the slower background stage sync. */
export async function getLiveChatbotLeadStage(input: {
    facebookPageId: string;
    psid: string;
    accessToken: string;
    historyStartAt?: string | null;
    conversation?: FacebookConversation | null;
}) {
    if (input.historyStartAt && !Number.isFinite(Date.parse(input.historyStartAt))) {
        throw new Error('Could not verify lead stage: invalid conversation reset time');
    }
    // A history reset cannot hide a current Facebook Qualified label. Always
    // read assignments for this PSID, even when conversation history is cached
    // by the current webhook turn. Never substitute the Page-wide label list.
    let labels: Awaited<ReturnType<typeof getMessengerContactLabels>>;
    let labelsUnavailable = false;
    try {
        labels = await getMessengerContactLabels(input.psid, input.accessToken, { timeoutMs: 5000 });
    } catch (error) {
        // Some Page-scoped profiles cannot be read even with valid Page tokens.
        // Preserve strict verification unless the operator explicitly selects
        // history fallback. A failed later page must never discard labels read
        // earlier, and auth, network and other Graph errors still stop delivery.
        if (process.env.CHATBOT_LABEL_ACCESS_POLICY !== 'history_fallback' ||
            !(error instanceof FacebookGraphApiError) || error.status !== 400 ||
            error.code !== 100 || error.subcode !== 33 || error.labelPagesRead !== 0) throw error;
        labels = [];
        labelsUnavailable = true;
        console.warn('Facebook label access unavailable; verifying full conversation history', {
            facebookPageId: input.facebookPageId, code: error.code, subcode: error.subcode
        });
    }
    const labelStop = findMessengerLabelAutomationStop(labels);
    if (labelStop) return labelStop;
    const conversation = input.conversation === undefined
        ? await getConversationForPsid(input.facebookPageId, input.psid, input.accessToken,
            { throwOnError: true, timeoutMs: 5000 })
        : input.conversation;
    let messages: Awaited<ReturnType<typeof getConversationMessages>> = conversation?.messages?.data || [];
    const firstPageSignal = findLatestMessengerAutomationStop(
        filterChatbotConversationHistory(messages, input.historyStartAt), input.facebookPageId
    );
    if (firstPageSignal) return firstPageSignal;
    if (conversation?.messages?.paging?.next) {
        // A stage event can be older than the first 100 messages. Never treat a
        // truncated/failed audit as permission to send.
        messages = await getConversationMessages(conversation.id, input.accessToken, 2000, {
            initialPage: conversation.messages, throwOnError: true,
            requireComplete: true, timeoutMs: 5000
        });
    }
    if (labelsUnavailable && (!conversation || !messages.some(message =>
        message.from?.id === input.psid && Number.isFinite(Date.parse(message.created_time || ''))))) {
        throw new Error('Could not verify contact history after Facebook denied inbox labels');
    }
    return findLatestMessengerAutomationStop(
        filterChatbotConversationHistory(messages, input.historyStartAt), input.facebookPageId
    );
}
