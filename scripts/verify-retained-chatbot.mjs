import fs from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(fs.readFileSync('verification/retained-chatbot-source.json','utf8'));
if(!manifest.original_reply_implementation_verified)throw Error('Original source comparison is required');
for(const file of manifest.files){const sha=createHash('sha256').update(fs.readFileSync(file.embedded)).digest('hex');if(sha!==file.relocated_sha256)throw Error('Retained source changed after verification: '+file.embedded);}
console.log(JSON.stringify({retained_files_verified:manifest.files.length,baseline:manifest.baseline_commit,reply_logic_changed:false}));
