const block = `PRIORITY FILL-UP FORM FOR INCOMING INQUIRIES
Read the available conversation and saved answers before replying. For the first eligible inquiry, including greetings, interest and price questions, send the page's missing form fields together in ONE readable multiline bubble, then exactly ONE short question that helps answer a missing field. Briefly answer a direct factual/price question before the form. No upsell or price-approval gate before collection.
Use the page's configured form: preserve the seven-field song template where selected, otherwise use configured detail labels. Omit known answers. Never collect package acceptance as a form answer or save blank placeholders, examples, label options or guesses. Save actual answers under canonical detail keys. Additional requests is optional for the song brief.
Send the form once per conversation. On later turns, answer the current request and clarify at most one necessary unknown detail. Do not repeat a question already answered or resend any form sections unless explicitly requested. Honor one-by-one preferences, pauses, support needs, opt-outs, closed stages and human holds.
Use the latest verified team-approved quote for this customer and the same scope, preserving quantities, totals, deposits, balances and conditions. Use configured page pricing when no applicable team quote exists. A customer's proposed amount is not an approved change. Never invent discounts or change accepted scope.
Ordinary replies and reminders may use brief natural message bubbles when useful, while the complete form always stays in one bubble. Never force extra bubbles or split form fields. Do not repeat identical or nearly identical messages, change only an emoji or greeting, or repeat a previous unanswered question. Continue with one fresh useful detail from the conversation; if no useful fresh follow-up is available, skip it.
This current collection policy replaces older form-only, no-question-after-form, split-form, tiny-form and always-one-bubble guidance. Keep total character limits and scheduled reminder timing unchanged.`;

function replaceFormSection(text) {
    return (text || '')
        .replace(/\n*PRIORITY FILL-UP FORM FOR INCOMING INQUIRIES[\s\S]*$/, '')
        .replace(/^FORM-FIRST COLLECTION\r?\n[\s\S]*?(?=^(?:TRUTHFUL VALUE AND SUPPORT|FACTUAL CHECK)\b|(?![\s\S]))/gm, '')
        .replace(/Keep the complete missing fields; no extra sales paragraph or question after the form\./g,
            'Keep all missing form fields together, then ask one relevant missing-field question.')
        .replace(/No extra creative or sales question after the form\./g,
            'Follow the form with one relevant missing-field question.')
        .replace(/Ordinary replies:\s*ONE message,/g, 'Ordinary replies: 1-3 brief natural bubbles,')
        .replace(/Follow-ups:\s*ONE message\s*<=120 characters/g, 'Follow-ups: 1-2 brief bubbles <=120 characters TOTAL')
        .replace(/no extra question after it/gi, 'one relevant missing-field question after it')
        .trim();
}

function formPrioritySettings(row) {
    const instructions = replaceFormSection(row.instructions)
        .replace(/^(?:PRIORITIZE_FILL_UP_FORM|ALLOW_BRIEF_FORM):[^\r\n]*\r?\n?/gim, '');
    const bot_dos = (row.bot_dos || '').split('\n').map(line => {
        if (/^- (?:Use the exact numbered seven-field owner form|Send the exact numbered seven-field owner form|Keep the form as the end|Prioritize the full missing owner form|End active lead replies)/i.test(line)) {
            return '- Send the configured missing form once in one multiline bubble, followed by one useful question about an unknown detail. Read and save answers before asking again.';
        }
        return line;
    }).join('\n');
    const bot_donts = (row.bot_donts || '')
        .replace(/Each bubble <=110 characters\./g, 'Keep all form fields together in one bubble; ordinary text and the follow-up question may use separate bubbles.')
        .replace(/Keep the complete form and its one relevant question together in one bubble\./g,
            'Keep all form fields together in one bubble; ordinary text and the follow-up question may use separate bubbles.')
        .replace(/Do not add a separate question after it\./g, 'Follow it with one relevant question about a missing field.');
    return { instructions: 'PRIORITIZE_FILL_UP_FORM: true\nALLOW_BRIEF_FORM: true\n' + instructions + '\n\n' + block + '\n',
        follow_up_prompt: replaceFormSection(row.follow_up_prompt) + '\n\n' + block,
        bot_dos, bot_donts, split_messages: true, max_message_parts: 3 };
}
module.exports = { formPrioritySettings };
