import { getPhilippinesDayOfWeek, getPhilippinesHour } from '@/lib/philippines-time';

/** Record the inbound activity before a follow-up sequence chooses its hour. */
export async function recordContactBestTime(input: {
    supabase: { from: (table: string) => any };
    pageId: string;
    contactId: string;
    interactionTime: Date;
}): Promise<number> {
    const hour = getPhilippinesHour(input.interactionTime);
    const { error: insertError } = await input.supabase.from('contact_interactions').insert({
        contact_id: input.contactId, page_id: input.pageId,
        interaction_at: input.interactionTime.toISOString(), hour_of_day: hour,
        day_of_week: getPhilippinesDayOfWeek(input.interactionTime), is_from_contact: true
    });
    if (insertError) throw new Error(insertError.message || 'Could not record contact activity');
    const { data, error: readError } = await input.supabase.from('contact_interactions')
        .select('hour_of_day').eq('contact_id', input.contactId).eq('is_from_contact', true);
    if (readError) throw new Error(readError.message || 'Could not read contact activity');
    const counts = new Map<number, number>();
    for (const item of data || []) {
        if (Number.isInteger(item.hour_of_day) && item.hour_of_day >= 0 && item.hour_of_day <= 23) {
            counts.set(item.hour_of_day, (counts.get(item.hour_of_day) || 0) + 1);
        }
    }
    // Use the latest inbound hour to break equal-frequency ties.
    const ranked = [...counts].map(([candidateHour, count]) => ({ hour: candidateHour, count }))
        .sort((a, b) => b.count - a.count || Number(b.hour === hour) - Number(a.hour === hour) || a.hour - b.hour);
    const bestHour = ranked[0]?.hour ?? hour;
    const count = ranked.reduce((total, item) => total + item.count, 0);
    const { error: updateError } = await input.supabase.from('contacts').update({
        best_contact_hour: bestHour,
        best_contact_hours: ranked.slice(0, 5),
        best_contact_confidence: count >= 5 ? 'high' : count >= 2 ? 'medium' : 'inferred'
    }).eq('id', input.contactId);
    if (updateError) throw new Error(updateError.message || 'Could not save contact best time');
    return bestHour;
}
