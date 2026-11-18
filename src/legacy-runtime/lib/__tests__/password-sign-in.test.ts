import { createHash } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), lookup: vi.fn(), insert: vi.fn(), upsert: vi.fn() }));
vi.mock('../supabase', () => ({ getSupabaseAdmin: () => ({ from: m.from }) }));
import { authorizePasswordSignIn, verifyAccountPassword } from '../password-sign-in';
import { authOptions } from '../auth';

const password = 'test-only-password';
const stored = 'veo-sha256:' + hashSync(createHash('sha256').update(password).digest('base64'), 4);
const account = { id: 'retained-user', email: 'saved@example.test', name: 'Existing owner', image: null, is_active: true, password_hash: stored };
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUNO_OWNER_LOGIN_EMAIL', ''); vi.stubEnv('SUNO_OWNER_ACCOUNT_EMAIL', '');
    const query = { select: m.select, eq: m.eq, maybeSingle: m.lookup, single: m.lookup, insert: m.insert, upsert: m.upsert };
    m.from.mockReturnValue(query); m.select.mockReturnValue(query); m.eq.mockReturnValue(query);
    m.lookup.mockResolvedValue({ data: account, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('password sign-in preserves existing accounts', () => {
    it('uses a configured login alias while retaining the stored identity and email', async () => {
        vi.stubEnv('SUNO_OWNER_LOGIN_EMAIL', 'alias@example.test');
        vi.stubEnv('SUNO_OWNER_ACCOUNT_EMAIL', account.email);
        const user = await authorizePasswordSignIn({ email: ' ALIAS@example.test ', password });
        expect(m.eq).toHaveBeenCalledWith('email', account.email);
        expect(user).toEqual({ id: account.id, email: account.email, name: account.name, image: null });
        expect(user).not.toHaveProperty('password_hash'); expect(user).not.toHaveProperty('password');
        expect(m.insert).not.toHaveBeenCalled(); expect(m.upsert).not.toHaveBeenCalled();
    });
    it('supports an existing stored email without alias configuration', async () => {
        expect((await authorizePasswordSignIn({ email: account.email, password }))?.id).toBe(account.id);
    });
    it.each([undefined, { email: 'not-an-email', password }, { email: account.email, password: '' }])('rejects malformed credentials before querying data', async input => {
        expect(await authorizePasswordSignIn(input)).toBeNull(); expect(m.from).not.toHaveBeenCalled();
    });
    it('rejects an incorrect password without writing an account', async () => {
        expect(await authorizePasswordSignIn({ email: 'wrong@example.test', password: 'incorrect' })).toBeNull();
        expect(m.insert).not.toHaveBeenCalled(); expect(m.upsert).not.toHaveBeenCalled();
    });
    it('rejects a disabled account', async () => {
        m.lookup.mockResolvedValue({ data: { ...account, is_active: false }, error: null });
        expect(await authorizePasswordSignIn({ email: 'disabled@example.test', password })).toBeNull();
    });
    it('does not create an account when no identity exists', async () => {
        m.lookup.mockResolvedValue({ data: null, error: null });
        expect(await authorizePasswordSignIn({ email: 'missing@example.test', password })).toBeNull();
        expect(m.upsert).not.toHaveBeenCalled();
    });
    it('reports a database outage without calling it a bad password', async () => {
        m.lookup.mockResolvedValue({ data: null, error: { code: '503' } });
        await expect(authorizePasswordSignIn({ email: 'offline@example.test', password })).rejects.toThrow('SignInUnavailable');
    });
    it('bounds repeated failures within an instance and permits a retry after expiry', async () => {
        const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
        m.lookup.mockResolvedValue({ data: null, error: null });
        for (let attempt = 0; attempt < 8; attempt++) expect(await authorizePasswordSignIn({ email: 'limited@example.test', password })).toBeNull();
        await expect(authorizePasswordSignIn({ email: 'limited@example.test', password })).rejects.toThrow('TooManyAttempts');
        expect(m.lookup).toHaveBeenCalledTimes(8);
        clock.mockReturnValue(1000 + 10 * 60 * 1000 + 1);
        expect(await authorizePasswordSignIn({ email: 'limited@example.test', password })).toBeNull();
        expect(m.lookup).toHaveBeenCalledTimes(9);
    });
});

it('checks prehashed long passwords without bcrypt truncation and retains legacy bcrypt support', async () => {
    const long = 'a'.repeat(80) + 'one';
    const longHash = 'veo-sha256:' + hashSync(createHash('sha256').update(long).digest('base64'), 4);
    expect(await verifyAccountPassword(long, longHash)).toBe(true);
    expect(await verifyAccountPassword('a'.repeat(80) + 'two', longHash)).toBe(false);
    expect(await verifyAccountPassword(password, hashSync(password, 4))).toBe(true);
    expect(await verifyAccountPassword(password, 'unsupported')).toBe(false);
});

it('adds credentials alongside Facebook and keeps credentials JWTs on the retained user ID', async () => {
    expect(authOptions.providers.map(provider => (provider as any).id)).toEqual(['credentials', 'facebook']);
    const jwt = authOptions.callbacks!.jwt as any;
    const token = await jwt({ token: { accessToken: 'old-token', facebookId: 'old-facebook' }, account: { provider: 'credentials' }, user: { id: account.id, email: account.email, name: account.name, image: null } });
    expect(token.id).toBe(account.id); expect(token.accessToken).toBeUndefined(); expect(token.facebookId).toBeUndefined();
    expect(m.from).not.toHaveBeenCalled();
});

it('preserves Facebook sign-in tokens and the existing stored identity', async () => {
    const token = await (authOptions.callbacks!.jwt as any)({ token: {}, account: { provider: 'facebook', access_token: 'facebook-token', providerAccountId: 'facebook-id' }, user: { email: account.email, name: account.name } });
    expect(token).toMatchObject({ id: account.id, accessToken: 'facebook-token', facebookId: 'facebook-id' });
    expect(m.upsert).not.toHaveBeenCalled();
});
