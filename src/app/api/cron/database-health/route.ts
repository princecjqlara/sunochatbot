import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { readStorageMetrics } from '@/lib/veo-storage-health';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function GET(request: NextRequest) {
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (process.env.VEO_WORKSPACE_ENABLED !== 'true') return NextResponse.json({ skipped: true });
    const db = getSupabaseAdmin();let metrics: any = { available: false };
    try { metrics = await readStorageMetrics(); } catch { /* Record unavailable monitoring instead of a healthy result. */ }
    try {
        const recorded = await db.rpc('veo_record_storage_metrics', { p_metrics: metrics });
        if (recorded.error || !recorded.data) throw Error('Storage monitor checkpoint unavailable');
        let state = recorded.data, maintenanceRetry = false;
        // The normal hosted health schedule also supplies bounded retention when
        // a configured SQL cron has not actually run. This is independent of
        // Veo salary/quotas and must not depend on optional imports being enabled.
        const lastMaintenance = Date.parse(state.maintenance_at || '');
        const maintenanceDue = state.maintenance_healthy === false || Number.isFinite(lastMaintenance) && Date.now() - lastMaintenance >= 5 * 60000;
        if (process.env.SUNO_RETAINED_RUNTIME_ENABLED === 'true' && maintenanceDue &&
            state.resource_metrics_fresh === true && state.resource_pressure === false) {
            try {
                const maintained = await db.rpc('veo_storage_maintenance');
                if (maintained.error || !maintained.data) maintenanceRetry = true;
                else if (maintained.data.skipped) maintenanceRetry = state.maintenance_healthy !== true;
                else {
                    const refreshed = await db.rpc('veo_storage_status');
                    if (refreshed.error || !refreshed.data) maintenanceRetry = true;
                    else state = refreshed.data;
                }
            } catch { maintenanceRetry = true; }
        }
        const healthy = state.status === 'healthy' && state.maintenance_healthy && state.resource_metrics_fresh === true && state.resource_pressure === false && !maintenanceRetry;
        if (!healthy) console.warn('[DATABASE_HEALTH] Database requires attention', { status: state.status, maintenanceHealthy: state.maintenance_healthy,
            resourceMetricsFresh: state.resource_metrics_fresh, resourcePressure: state.resource_pressure_reasons });
        return NextResponse.json({ ok: healthy, ...state, maintenance_retry: maintenanceRetry }, { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
    } catch { return NextResponse.json({ ok: false, error: 'Storage health is temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
