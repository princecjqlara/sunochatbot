import { isRetryableFacebookSendError } from './facebook-send-retry';

export const CHATBOT_BEFORE_DELIVERY_RETRY_PREFIX = 'Retryable before delivery: ';

function isRetryableReplyFailure(message: string): boolean {
    return message.startsWith(CHATBOT_BEFORE_DELIVERY_RETRY_PREFIX) ||
        isRetryableFacebookSendError(new Error(message));
}

type SupabaseLike = {
    from: (table: string) => any;
};

export async function claimChatbotReply(
    supabase: SupabaseLike,
    input: { inboundMessageId: string; pageId: string; contactId: string }
): Promise<boolean> {
    const { error } = await supabase
        .from('chatbot_reply_events')
        .insert({
            inbound_message_id: input.inboundMessageId,
            page_id: input.pageId,
            contact_id: input.contactId,
            status: 'processing'
        });

    if (!error) return true;
    if (error.code !== '23505') throw new Error(error.message || 'Could not claim chatbot reply');

    const { data: previous, error: readError } = await supabase
        .from('chatbot_reply_events')
        .select('status, error_message, outbound_message_id, updated_at')
        .eq('inbound_message_id', input.inboundMessageId)
        .eq('page_id', input.pageId)
        .eq('contact_id', input.contactId)
        .maybeSingle();
    if (readError) throw new Error(readError.message || 'Could not read chatbot reply claim');
    if (previous?.status !== 'failed' || previous.outbound_message_id ||
        !isRetryableReplyFailure(previous.error_message || '')) return false;

    // Compare versions atomically so only one redelivery may retry.
    const { data: reclaimed, error: reclaimError } = await supabase
        .from('chatbot_reply_events')
        .update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() })
        .eq('inbound_message_id', input.inboundMessageId)
        .eq('page_id', input.pageId)
        .eq('contact_id', input.contactId)
        .eq('status', 'failed')
        .eq('updated_at', previous.updated_at)
        .is('outbound_message_id', null)
        .select('inbound_message_id');
    if (reclaimError) throw new Error(reclaimError.message || 'Could not retry chatbot reply');
    return Boolean(reclaimed?.length);
}

export async function finishChatbotReply(
    supabase: SupabaseLike,
    inboundMessageId: string,
    result: { status: 'sent' | 'failed'; outboundMessageId?: string; error?: string }
): Promise<void> {
    const { error } = await supabase
        .from('chatbot_reply_events')
        .update({
            status: result.status,
            outbound_message_id: result.outboundMessageId || null,
            error_message: result.error?.slice(0, 1000) || null,
            updated_at: new Date().toISOString()
        })
        .eq('inbound_message_id', inboundMessageId);

    if (error) throw new Error(error.message || 'Could not finish chatbot reply');
}
