/** Unit and isolated SQL tests must not inherit hosted application credentials
 * or production feature flags. Individual suites configure their own fixtures. */
export function releaseTestEnvironment(source) {
    const applicationVariable = /^(?:SUNO_|VEO_|FACEBOOK_|TELEGRAM_|NEXTAUTH_|AUTH_|SUPABASE_|NEXT_PUBLIC_SUPABASE_|DATABASE_|OPENROUTER_|CHATBOT_|GOOGLE_DRIVE_|VERCEL_|CRON_SECRET$|PUBLIC_APP_URL$)/i;
    return {
        ...Object.fromEntries(Object.entries(source).filter(([key]) => !applicationVariable.test(key))),
        NODE_ENV: 'test',
    };
}
