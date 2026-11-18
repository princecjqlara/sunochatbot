import { sendMessage } from '@/lib/facebook';
import { DuplicateChatbotMessageError, finishChatbotMessage, reserveChatbotMessage } from '@/lib/chatbot-message-delivery';
import { retryFacebookSend } from '@/lib/facebook-send-retry';

/** A reservation survives timeouts and failed acknowledgments for reconciliation. */
export async function sendSunoMessage(input: Parameters<typeof reserveChatbotMessage>[0] & {
    args: Parameters<typeof sendMessage>; checkDelivery: () => Promise<void>;
}) {
    await input.checkDelivery();
    const deliveryId = await reserveChatbotMessage(input);
    if (!deliveryId) throw new DuplicateChatbotMessageError();
    const result = await retryFacebookSend(async () => {
        await input.checkDelivery();
        return sendMessage(...input.args);
    });
    await finishChatbotMessage({supabase:input.supabase,deliveryId,messageId:result.message_id});
    return result;
}
