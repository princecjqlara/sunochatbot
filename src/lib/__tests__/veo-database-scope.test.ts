import { afterEach, expect, it, vi } from 'vitest';
import { assertVeoDatabaseUrl } from '../veo-database-scope';
afterEach(() => { vi.unstubAllEnvs(); });
it.each(['vhtbmdizugnxkgocmruq', 'mjuluaqrvbnycisnarzi', 'pnhzpeyzpwsmwcuafgpw'])(
    'rejects the non-Suno project %s even with enforcement off', project => {
        vi.stubEnv('VEO_PAGE_SCOPE_ENFORCED', 'false');
        expect(() => assertVeoDatabaseUrl(`https://${project}.supabase.co`)).toThrow('disabled');
    },
);
it('accepts Suno and rejects an override to another project', () => {
    vi.stubEnv('VEO_PAGE_SCOPE_ENFORCED', 'true');
    vi.stubEnv('VEO_DATABASE_PROJECT_REF', 'cxgynadprukyeuqbchbs');
    expect(() => assertVeoDatabaseUrl('https://cxgynadprukyeuqbchbs.supabase.co')).not.toThrow();
    expect(() => assertVeoDatabaseUrl('https://other.supabase.co')).toThrow('configured');
    vi.stubEnv('VEO_DATABASE_PROJECT_REF', 'other');
    expect(() => assertVeoDatabaseUrl('https://other.supabase.co')).toThrow('configured');
});
it.each(['http://cxgynadprukyeuqbchbs.supabase.co', 'https://user:password@cxgynadprukyeuqbchbs.supabase.co',
    'https://cxgynadprukyeuqbchbs.supabase.co/other', 'https://cxgynadprukyeuqbchbs.supabase.co?other=1'])(
    'rejects an unsafe database origin', url => expect(() => assertVeoDatabaseUrl(url)).toThrow('secure'),
);
