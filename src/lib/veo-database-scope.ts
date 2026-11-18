// Retain the upstream export name while binding this checkout to Suno.
export const VEO_DATABASE_PROJECT='cxgynadprukyeuqbchbs';
const blockedProjects=['vhtbmdizugnxkgocmruq','mjuluaqrvbnycisnarzi','pnhzpeyzpwsmwcuafgpw'];
export function assertVeoDatabaseUrl(url:string):void {
    const parsed=new URL(url),hostname=parsed.hostname;
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('A secure Suno Supabase origin is required.');
    if(blockedProjects.some(project=>hostname===project+'.supabase.co'))throw new Error('Veo and former shared databases are disabled for Sunobot.');
    if(process.env.VEO_PAGE_SCOPE_ENFORCED==='true') {
        const expected=process.env.VEO_DATABASE_PROJECT_REF||VEO_DATABASE_PROJECT;
        if(expected!==VEO_DATABASE_PROJECT||hostname!==expected+'.supabase.co')throw new Error('Sunobot must use its configured Supabase project.');
    }
}
