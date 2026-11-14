import fs from 'node:fs';
const base='http://127.0.0.1:3100';
const cron=fs.readdirSync('src/app/api/cron').filter(name=>fs.existsSync('src/app/api/cron/'+name+'/route.ts'));
const cases=[['/',200],['/sales-form',200],['/api/auth/session',200],['/api/auth/providers',200],['/api/auth/csrf',200],['/api/sales-form',401],['/api/workspace',401],['/api/test-facebook',404],...cron.map(name=>['/api/cron/'+name,401])];
const results=[];
for(const [path,expected] of cases){const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(20000)});results.push({path,status:response.status,expected,passed:response.status===expected});}
for(const name of cron){const path='/api/cron/'+name;const response=await fetch(base+path,{redirect:'manual',headers:{'x-middleware-subrequest':'middleware:middleware:middleware:middleware:middleware'},signal:AbortSignal.timeout(20000)});results.push({path,forged_middleware_header:true,status:response.status,expected:401,passed:response.status===401});}
fs.writeFileSync('verification/implementation-http-smoke.json',JSON.stringify({base,authenticated:false,sends_invoked:false,passed:results.every(r=>r.passed),results},null,2)+'\n');
console.log(JSON.stringify({passed:results.every(r=>r.passed),checks:results.length,failed:results.filter(r=>!r.passed)}));
if(results.some(r=>!r.passed))process.exitCode=1;
