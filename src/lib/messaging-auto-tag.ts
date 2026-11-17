export type MessengerSystemSignal = 'order_created' | 'qualified' | 'not_qualified' | 'converted';
export type MessengerAutomationStopReason = MessengerSystemSignal | 'manual';

/** Meta exposes current lead stages as inbox labels, without necessarily
 * adding a message. Only Intake and Meta's advertising attribution labels
 * permit automation. Other business labels conservatively keep the team in
 * control, including newly named stages.
 */
export function findMessengerLabelAutomationStop(
    labels: Array<{ page_label_name: string }>
): MessengerAutomationStopReason | null {
    const names = labels.map(label => label.page_label_name.trim().toLowerCase().replace(/[_\s-]+/g, ' '));
    if (names.some(name => ['converted', 'paid', 'won'].includes(name))) return 'converted';
    if (names.some(name => ['order created', 'order placed', 'dispatched'].includes(name))) return 'order_created';
    if (names.some(name => ['not qualified', 'disqualified', 'unqualified'].includes(name))) return 'not_qualified';
    if (names.includes('qualified')) return 'qualified';
    return names.some(name => name !== 'intake' && !/^ad[ _]id\./i.test(name) &&
        !['messenger ads', 'ad response'].includes(name)) ? 'manual' : null;
}

type MessengerHistoryMessage = {
    id?: string;
    message?: string;
    from?: { id?: string };
    created_time?: string;
};

export function getMessengerLeadStageName(text: string): string | null {
    return /^Lead\s+stage\s+set\s+to\s+([^\r\n]+?)\.?$/i.exec(text.trim())?.[1].trim() || null;
}

/** Intake is the only explicit Lead Center stage that permits bot automation.
 * Keep outcome tagging separate: a custom stage must stop the bot without being
 * incorrectly labeled Qualified/Converted in the sales pipeline.
 */
export function findLatestMessengerAutomationStop(
    messages: MessengerHistoryMessage[],
    facebookPageId: string
): MessengerAutomationStopReason | null {
    const assignments = messages.flatMap((message, index) => {
        if (message.from?.id !== facebookPageId || typeof message.message !== 'string') return [];
        const stage = getMessengerLeadStageName(message.message);
        if (!stage) return [];
        return [{ message, stage, index, timestamp: Date.parse(message.created_time || '') }];
    });
    assignments.sort((a, b) => {
        const aValid = Number.isFinite(a.timestamp), bValid = Number.isFinite(b.timestamp);
        if (aValid && bValid && a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
        if (aValid !== bValid) return aValid ? -1 : 1;
        return a.index - b.index;
    });
    const latest = assignments[0];
    if (latest && !/^intake$/i.test(latest.stage)) {
        return classifyMessengerSystemMessage(latest.message.message!) || 'manual';
    }
    // Returning to Intake does not undo an actual Messenger order.
    return messages.some(message => message.from?.id === facebookPageId &&
        classifyMessengerSystemMessage(message.message || '') === 'order_created' &&
        !/^Lead\s+stage\s+set\s+to\s+/i.test(message.message?.trim() || '')) ? 'order_created' : null;
}

export type MessengerLeadStageEvent = {
    messageId: string;
    signal: MessengerSystemSignal;
    createdTime: string | null;
};

// These are Meta-generated conversation-history messages, not customer/staff prose.
// The stage and order text was observed in the app's read-only Messenger audit.
export function classifyMessengerSystemMessage(text: string): MessengerSystemSignal | null {
    const value = text.trim();
    const stage = /^Lead stage set to (Qualified|Not Qualified|Disqualified|Converted|Order Created)\.?$/i.exec(value);
    if (stage) {
        const normalized = stage[1].toLowerCase().replace(/\s+/g, '_');
        return normalized === 'disqualified' ? 'not_qualified' : normalized as MessengerSystemSignal;
    }

    if (/^You (?:created an order for|requested) (?:PHP|\u20B1)[\d,.]+\b/i.test(value) &&
        /fb-pma:\/\/payments\/orderdetails\/\?[^\s]*invoice_id=\d+/i.test(value)) {
        return 'order_created';
    }

    return null;
}

/** Find the newest terminal Lead Center event written into a Messenger thread. */
export function findLatestMessengerSystemSignal(
    messages: MessengerHistoryMessage[],
    facebookPageId: string
): MessengerSystemSignal | null {
    const matches = messages.flatMap((message, index) => {
        if (message.from?.id !== facebookPageId || typeof message.message !== 'string') return [];
        const signal = classifyMessengerSystemMessage(message.message);
        if (!signal) return [];
        const timestamp = typeof message.created_time === 'string'
            ? new Date(message.created_time).getTime()
            : Number.NaN;
        return [{ signal, index, timestamp }];
    });

    if (matches.length === 0) return null;
    matches.sort((left, right) => {
        const leftHasTimestamp = Number.isFinite(left.timestamp);
        const rightHasTimestamp = Number.isFinite(right.timestamp);
        if (leftHasTimestamp && rightHasTimestamp && left.timestamp !== right.timestamp) {
            return right.timestamp - left.timestamp;
        }
        if (leftHasTimestamp !== rightHasTimestamp) return leftHasTimestamp ? -1 : 1;
        // Facebook currently returns conversation history newest-first.
        return left.index - right.index;
    });
    return matches[0].signal;
}

/** Find the newest explicit Lead Center stage change and keep its audit metadata. */
export function findLatestMessengerLeadStageEvent(
    messages: MessengerHistoryMessage[],
    facebookPageId: string
): MessengerLeadStageEvent | null {
    const matches = messages.flatMap((message, index) => {
        if (
            message.from?.id !== facebookPageId ||
            typeof message.id !== 'string' ||
            !message.id.trim() ||
            typeof message.message !== 'string' ||
            !/^Lead stage set to /i.test(message.message.trim())
        ) return [];
        const signal = classifyMessengerSystemMessage(message.message);
        if (!signal) return [];
        const timestamp = typeof message.created_time === 'string'
            ? new Date(message.created_time).getTime()
            : Number.NaN;
        return [{
            messageId: message.id.trim(),
            signal,
            createdTime: message.created_time || null,
            index,
            timestamp
        }];
    });

    if (matches.length === 0) return null;
    matches.sort((left, right) => {
        const leftHasTimestamp = Number.isFinite(left.timestamp);
        const rightHasTimestamp = Number.isFinite(right.timestamp);
        if (leftHasTimestamp && rightHasTimestamp && left.timestamp !== right.timestamp) {
            return right.timestamp - left.timestamp;
        }
        if (leftHasTimestamp !== rightHasTimestamp) return leftHasTimestamp ? -1 : 1;
        return left.index - right.index;
    });
    const latest = matches[0];
    return {
        messageId: latest.messageId,
        signal: latest.signal,
        createdTime: latest.createdTime
    };
}
