import { getPhilippinesDateParts, getPhilippinesScheduledAtIso } from '@/lib/philippines-time';
import { getConversationForPsid } from '@/lib/facebook';
import { assessChatbotPurchaseIntent, type ChatbotConfig } from '@/lib/chatbot';
import { hasConversationPrice } from '@/lib/chatbot-conversation-pricing';
import { filterChatbotConversationHistory, hasReachedChatbotDetailTarget, isChatbotContactAllowed } from '@/lib/chatbot-control';
import { isPipelineClosedForAutomation } from '@/lib/contact-pipeline';
import { getLiveChatbotLeadStage } from '@/lib/chatbot-lead-stage';
import {getAutomationPageScope,scopeAutomationQuery} from '@/lib/page-automation-scope';
import type { FacebookMessage } from '@/types';

type SupabaseLike = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };
export type HumanPauseState = {
    human_pause_status?: string | null;
    human_takeover_at?: string | null;
    human_resume_at?: string | null;
    human_message_id?: string | null;
    human_hold_reason?: string | null;
};

export function isChatbotHumanPaused(state?: HumanPauseState | null): boolean {
    return ['paused', 'checking', 'held'].includes(state?.human_pause_status || '');
}

export function getHumanTakeoverResumeAt(takenOverAt: Date): string {
    if (!Number.isFinite(takenOverAt.getTime())) throw new Error('Invalid human takeover time');
    const parts = getPhilippinesDateParts(takenOverAt);
    let at = Date.parse(getPhilippinesScheduledAtIso(23, parts)) + 59 * 60 * 1000;
    if (at <= takenOverAt.getTime()) {
        at = Date.parse(getPhilippinesScheduledAtIso(23, { ...parts, day: parts.day + 1 })) + 59 * 60 * 1000;
    }
    return new Date(at).toISOString();
}

export async function pauseChatbotForHumanTakeover(supabase: SupabaseLike, input: {
    pageId: string; contactId: string; messageId: string; messageText?: string; takenOverAt?: string;
}): Promise<void> {
    if (!supabase.rpc) throw new Error('Human takeover persistence is unavailable');
    const at = new Date(input.takenOverAt || Date.now());
    const { error } = await supabase.rpc('record_chatbot_human_takeover', {
        p_page_id: input.pageId, p_contact_id: input.contactId, p_message_id: input.messageId,
        p_taken_over_at: at.toISOString(), p_resume_at: getHumanTakeoverResumeAt(at),
        p_price_quote: hasConversationPrice(input.messageText || '') ? input.messageText!.slice(0, 3000) : null
    });
    if (error) throw new Error(error.message || 'Could not pause chatbot for human takeover');
}

/** Strong evidence prevents automatic restart even if an AI classifier misses it. */
export function getExplicitSongOrderIntent(history: FacebookMessage[], pageId: string): string | null {
    for (const message of history.filter(m => m.from?.id !== pageId)) {
        const text = (message.message || '').trim();
        if (!text) continue;
        if (/\b(?:paid already|payment sent|sent (?:the )?payment|nakabayad|nabayaran|nagbayad na|bayad na|na[- ]?send ko (?:na )?(?:ang )?bayad)\b/i.test(text)) return 'Customer has paid or sent payment';
        if (/\b(?:not|don't|do not|hindi|hinde|di|ayaw|ayoko|wag|huwag)\b.{0,35}\b(?:proceed|order|magpagawa|magpapagawa|tutuloy|ituloy)\b/i.test(text)) continue;
        if (/\b(?:ready to (?:order|proceed)|let'?s proceed|go ahead (?:with|and)|i (?:want|would like) to (?:order|proceed)|proceed (?:na|po)|ituloy (?:na|po)|gawa(?:n)? (?:na|na po)|gusto (?:ko|namin|kong).{0,25}(?:magpagawa|magpapagawa|pagawa)|magpapagawa (?:ako|kami))\b/i.test(text)) return 'Customer clearly asked to proceed with a song order';
    }
    return null;
}

/** Runs on the existing minute cron; it never releases an unverified human handoff. */
export async function processDueHumanTakeovers(input: { supabase: SupabaseLike; now?: Date; limit?: number }) {
    const { supabase } = input;
    const now = input.now || new Date();
    // Leave time for the other minute workers if Meta or the intent provider is
    // slow. Unclaimed rows remain due for the next run.
    const deadline = Date.now() + 60_000;
    const result = { checked: 0, released: 0, held: 0, scheduled: 0, failed: 0 };
    const scope=await getAutomationPageScope(supabase);
    const { error: leaseError } = await scopeAutomationQuery(supabase.from('chatbot_contact_states')
        .update({ human_pause_status: 'paused', updated_at: now.toISOString() })
        .eq('human_pause_status', 'checking').lt('updated_at', new Date(now.getTime() - 10 * 60 * 1000).toISOString()),scope);
    if (leaseError) throw leaseError;
    const { data: due, error } = await scopeAutomationQuery(supabase.from('chatbot_contact_states').select('*')
        .eq('human_pause_status', 'paused').lte('human_resume_at', now.toISOString())
        .order('human_resume_at').limit(input.limit || 20),scope);
    if (error) throw error;
    for (const state of due || []) {
        if (Date.now() >= deadline) break;
        const { data: claimed, error: claimError } = await supabase.from('chatbot_contact_states')
            .update({ human_pause_status: 'checking', updated_at: now.toISOString() })
            .eq('page_id', state.page_id).eq('contact_id', state.contact_id)
            .eq('human_message_id', state.human_message_id).eq('human_pause_status', 'paused').select('contact_id');
        if (claimError) { result.failed += 1; continue; }
        if (!claimed?.length) continue;
        result.checked += 1;
        const finish = async (status: 'paused' | 'released' | 'held', reason: string | null) => {
            const { data, error } = await supabase.from('chatbot_contact_states')
                .update({ human_pause_status: status, human_hold_reason: reason, updated_at: now.toISOString() })
                .eq('page_id', state.page_id).eq('contact_id', state.contact_id)
                .eq('human_message_id', state.human_message_id).eq('human_pause_status', 'checking').select('contact_id');
            if (error) throw error;
            return Boolean(data?.length);
        };
        try {
            const [contactResult, configResult, pageResult] = await Promise.all([
                supabase.from('contacts').select('id,page_id,psid,name,last_inbound_at,pipeline_stage,best_contact_hour,chatbot_enabled')
                    .eq('id', state.contact_id).eq('page_id', state.page_id).maybeSingle(),
                supabase.from('chatbot_configs').select('*').eq('page_id', state.page_id).maybeSingle(),
                supabase.from('pages').select('fb_page_id,access_token').eq('id', state.page_id).maybeSingle()
            ]);
            if ([contactResult, configResult, pageResult].some(r => r.error)) throw new Error('Could not verify human takeover eligibility');
            const contact = contactResult.data, config = configResult.data as ChatbotConfig, page = pageResult.data;
            let holdReason: string | null = null;
            if (!contact || contact.chatbot_enabled === false || !page || !config?.enabled || !isChatbotContactAllowed(config, state.contact_id)) holdReason = 'Page or chatbot is unavailable for this contact';
            else if (state.status === 'stopped' || isPipelineClosedForAutomation(contact.pipeline_stage) ||
                hasReachedChatbotDetailTarget(config, state.collected_details)) holdReason = 'Order, completed requirements, opt-out or closed lead remains with the team';
            let history: FacebookMessage[] = [];
            if (!holdReason) {
                const conversation = await getConversationForPsid(page.fb_page_id, contact.psid, page.access_token,
                    { throwOnError: true, timeoutMs: 10000 });
                if (!conversation) throw new Error('Conversation unavailable for takeover review');
                history = filterChatbotConversationHistory(conversation.messages?.data || [], state.history_start_at);
                holdReason = await getLiveChatbotLeadStage({ facebookPageId: page.fb_page_id,
                    psid: contact.psid, accessToken: page.access_token, historyStartAt: state.history_start_at, conversation })
                    ? 'Lead Center is no longer in Intake or has an order'
                    : getExplicitSongOrderIntent(history, page.fb_page_id);
                if (!holdReason && history.some(m => m.from?.id !== page.fb_page_id &&
                    !m.message?.trim() && Date.parse(m.created_time || '') >= Date.parse(state.human_takeover_at || ''))) {
                    holdReason = 'Customer attachment after takeover requires human review';
                }
                if (!holdReason) {
                    const assessment = await assessChatbotPurchaseIntent({ pageId: page.fb_page_id, history,
                        collectedDetails: state.collected_details || {}, model: config.model });
                    if (assessment.hold) holdReason = assessment.reason;
                }
            }
            if (holdReason) {
                if (await finish('held', holdReason)) result.held += 1;
                continue;
            }
            // A stage may change while the intent provider is preparing its assessment.
            if (await getLiveChatbotLeadStage({ facebookPageId: page.fb_page_id,
                psid: contact.psid, accessToken: page.access_token, historyStartAt: state.history_start_at })) {
                if (await finish('held', 'Lead Center changed during takeover review')) result.held += 1;
                continue;
            }
            const latest = await supabase.from('contacts').select('last_inbound_at,pipeline_stage,chatbot_enabled')
                .eq('id', state.contact_id).eq('page_id', state.page_id).maybeSingle();
            if (latest.error) throw latest.error;
            if (latest.data?.chatbot_enabled === false || latest.data?.last_inbound_at !== contact.last_inbound_at ||
                isPipelineClosedForAutomation(latest.data?.pipeline_stage)) {
                await finish('paused', 'Conversation changed during takeover review');
                continue;
            }
            if(!supabase.rpc)throw new Error('Atomic takeover recovery is unavailable');
            const completed=await supabase.rpc('suno_finish_takeover_review',{p_page:state.page_id,p_contact:state.contact_id,
                p_human_message:state.human_message_id,p_epoch:state.automation_epoch||0,p_policy:config.policy_revision||1,p_anchor:contact.last_inbound_at||null});
            if(completed.error||typeof completed.data?.released!=='boolean'||typeof completed.data?.scheduled!=='boolean')throw new Error('Could not finish the reviewed human takeover');
            if(!completed.data.released){await finish('paused','Conversation or permissions changed during takeover review');continue;}
            result.released+=1;
            if(completed.data.scheduled)result.scheduled+=1;
        } catch (error) {
            result.failed += 1;
            await finish('held', 'Human review required: ' + (error instanceof Error ? error.message : String(error))).catch(() => undefined);
        }
    }
    return result;
}
