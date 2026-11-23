import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ metrics: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/veo-storage-health', () => ({ readStorageMetrics: m.metrics }));
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ rpc: m.rpc }) }));
import { GET } from './route';
const request = (auth = true) => new NextRequest('https://veo.test/api/cron/database-health', { headers: auth ? { Authorization: 'Bearer test' } : {} });
beforeEach(() => { vi.clearAllMocks();vi.stubEnv('CRON_SECRET', 'test');vi.stubEnv('VEO_WORKSPACE_ENABLED', 'true');m.metrics.mockResolvedValue({ available: true }); });
afterEach(() => { vi.unstubAllEnvs(); });
it('authenticates before probing metrics or writing the bounded checkpoint', async () => {
    expect((await GET(request(false))).status).toBe(401);expect(m.metrics).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it('reports healthy only when both disk metrics and independent cleanup are healthy', async () => {
    m.rpc.mockResolvedValue({ data: { status: 'healthy', maintenance_healthy: true, resource_metrics_fresh: true, resource_pressure: false } });expect((await GET(request())).status).toBe(200);
    m.rpc.mockResolvedValueOnce({ data: { status: 'critical', maintenance_healthy: true } });expect((await GET(request())).status).toBe(503);
    m.rpc.mockResolvedValueOnce({ data: { status: 'healthy', maintenance_healthy: false } });expect((await GET(request())).status).toBe(503);
});
it('records failed monitoring and makes checkpoint failures visible', async () => {
    m.metrics.mockRejectedValueOnce(Error('offline'));m.rpc.mockResolvedValueOnce({ data: { status: 'unknown' } });expect((await GET(request())).status).toBe(503);
    expect(m.rpc).toHaveBeenCalledWith('veo_record_storage_metrics', { p_metrics: { available: false } });
    m.rpc.mockResolvedValueOnce({ error: { message: 'offline' } });expect((await GET(request())).status).toBe(503);
});
it('reports pressure or missing resource measurements despite healthy disk space', async () => {
    for (const resource of [{ resource_metrics_fresh: true, resource_pressure: true }, { resource_metrics_fresh: false, resource_pressure: false }, {}]) {
        m.rpc.mockResolvedValueOnce({ data: { status: 'healthy', maintenance_healthy: true, ...resource } });
        expect((await GET(request())).status).toBe(503);
    }
});
it('recovers stale retention on the normal Suno health schedule without touching financial maintenance',async()=>{
 vi.stubEnv('SUNO_RETAINED_RUNTIME_ENABLED','true');
 m.rpc.mockResolvedValueOnce({data:{status:'healthy',maintenance_healthy:false,resource_metrics_fresh:true,resource_pressure:false}})
  .mockResolvedValueOnce({data:{completed_event_payloads_cleared:0}})
  .mockResolvedValueOnce({data:{status:'healthy',maintenance_healthy:true,resource_metrics_fresh:true,resource_pressure:false}});
 expect((await GET(request())).status).toBe(200);expect(m.rpc.mock.calls.map(([name])=>name)).toEqual(['veo_record_storage_metrics','veo_storage_maintenance','veo_storage_status']);
});
it.each(['busy','failure','transport'])('keeps cleanup %s visible instead of unlocking bulk imports',async failure=>{
 vi.stubEnv('SUNO_RETAINED_RUNTIME_ENABLED','true');
 m.rpc.mockResolvedValueOnce({data:{status:'healthy',maintenance_healthy:false,resource_metrics_fresh:true,resource_pressure:false}});
 if(failure==='transport')m.rpc.mockRejectedValueOnce(Error('Offline'));else m.rpc.mockResolvedValueOnce(failure==='busy'?{data:{skipped:true}}:{error:{code:'55P03'}});
 const r=await GET(request());expect(r.status).toBe(503);expect(await r.json()).toMatchObject({maintenance_retry:true,maintenance_healthy:false});
 expect(m.rpc.mock.calls.map(([name])=>name)).not.toContain('veo_storage_status');
});
it('keeps the existing five-minute retention cadence before a healthy checkpoint becomes stale',async()=>{
 vi.stubEnv('SUNO_RETAINED_RUNTIME_ENABLED','true');
 m.rpc.mockResolvedValueOnce({data:{status:'healthy',maintenance_healthy:true,maintenance_at:new Date(Date.now()-6*60000).toISOString(),resource_metrics_fresh:true,resource_pressure:false}})
  .mockResolvedValueOnce({data:{completed_event_payloads_cleared:0}})
  .mockResolvedValueOnce({data:{status:'healthy',maintenance_healthy:true,resource_metrics_fresh:true,resource_pressure:false}});
 expect((await GET(request())).status).toBe(200);expect(m.rpc.mock.calls.map(([name])=>name)).toContain('veo_storage_maintenance');
});
