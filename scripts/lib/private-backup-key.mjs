import { spawnSync } from 'node:child_process';

function transform(mode, value) {
    if (process.platform !== 'win32') throw Error('This local backup key is protected by Windows CurrentUser DPAPI');
    if (!['Protect','Unprotect'].includes(mode)) throw Error('Invalid key operation');
    const script = "Add-Type -AssemblyName System.Security; $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $resultBytes=[Security.Cryptography.ProtectedData]::" + mode + "($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($resultBytes))";
    const result = spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:Buffer.from(value).toString('base64'),encoding:'utf8',windowsHide:true});
    if (result.error || result.status !== 0) throw Error('Windows backup-key protection failed');
    return Buffer.from(result.stdout.trim(),'base64');
}
export const protectBackupKey = key => transform('Protect',key);
export const unprotectBackupKey = protectedKey => transform('Unprotect',protectedKey);
