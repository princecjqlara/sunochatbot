import { createHash } from 'node:crypto';
import { compare } from 'bcryptjs';
import { getSupabaseAdmin } from './supabase';

const attempts = new Map<string, { count: number; expires: number }>();
const windowMs = 10 * 60 * 1000;

export async function verifyAccountPassword(password: string, stored: string): Promise<boolean> {
    if (!password || password.length > 1024 || !stored) return false;
    if (stored.startsWith('veo-sha256:')) {
        const input = createHash('sha256').update(password, 'utf8').digest('base64');
        return compare(input, stored.slice('veo-sha256:'.length));
    }
    if (/^\$2[aby]\$/.test(stored) && Buffer.byteLength(password, 'utf8') <= 72) return compare(password, stored);
    return false;
}

export async function authorizePasswordSignIn(credentials: Record<'email' | 'password', string> | undefined) {
    const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
    const password = typeof credentials?.password === 'string' ? credentials.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 1024) return null;
    const now = Date.now();
    for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    if ((attempts.get(email)?.count || 0) >= 8) throw new Error('TooManyAttempts');
    const alias = process.env.SUNO_OWNER_LOGIN_EMAIL?.trim().toLowerCase();
    const identity = alias && email === alias ? process.env.SUNO_OWNER_ACCOUNT_EMAIL?.trim() : email;
    if (!identity) return null;
    const { data: user, error } = await getSupabaseAdmin().from('users')
        .select('id,email,name,image,is_active,password_hash').eq('email', identity).maybeSingle();
    if (error) throw new Error('SignInUnavailable');
    let verified = false;
    try { verified = user?.is_active === true && await verifyAccountPassword(password, user.password_hash || ''); }
    catch { throw new Error('SignInUnavailable'); }
    if (!verified || !user) {
        if (attempts.size >= 500 && !attempts.has(email)) attempts.delete(attempts.keys().next().value!);
        const prior = attempts.get(email);
        attempts.set(email, { count: (prior?.count || 0) + 1, expires: prior?.expires || now + windowMs });
        return null;
    }
    attempts.delete(email);
    // Retain the existing identity and Page grants. Sign-in never creates a user or rewrites credentials.
    return { id: String(user.id), email: user.email, name: user.name, image: user.image };
}
