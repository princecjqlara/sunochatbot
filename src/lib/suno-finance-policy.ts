import {getSupabaseAdmin} from './supabase';
export async function sunoFinancialWorkersReady(db= getSupabaseAdmin()) {
    if(process.env.SUNO_RETAINED_RUNTIME_ENABLED!=='true')return true;
    const result=await db.rpc('suno_financial_workers_ready');
    if(result.error)throw Error('Earnings policy status is unavailable');
    return result.data===true;
}

export async function requireSunoFinancialPolicy(actor: string, db = getSupabaseAdmin()) {
    if (process.env.SUNO_RETAINED_RUNTIME_ENABLED !== 'true') return;
    const result = await db.rpc('suno_require_earnings_policy', {p_actor: actor});
    if (result.error) throw Object.assign(Error(result.error.code === '22023'
        ? 'Use Suno Sales & payments to record song sales, tips and revision fees.'
        : 'Earnings settings could not be verified. Retry shortly.'), {status: result.error.code === '22023' ? 409 : 503});
}
