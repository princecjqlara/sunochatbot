"""Package reviewable source, excluding environments, private metadata and caches."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import re
import subprocess
import zipfile

root=Path(__file__).resolve().parent.parent
folder=root.parent/'outputs'/'suno-system-implementation-2026-11-15'
folder.mkdir(parents=True,exist_ok=True)
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0')
private=[]
for env_path in (root/'.env.local',root/'jaucian/.env.local'):
    for line in env_path.read_text(encoding='utf-8').splitlines():
        name,sep,value=line.partition('=')
        if sep and re.search(r'SECRET|TOKEN|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY|DATABASE.*URL',name) and 'ANON' not in name and len(value.strip('"'))>12:
            private.append(value.strip('"').encode())
entries=[]
for name in sorted(set(filter(None,files))):
    path=root/name
    if not path.is_file() or path.suffix in {'.log','.zip','.pyc','.tsbuildinfo'} or any(part in {'.private','.next','node_modules','node_modules.shared-veo','__pycache__','.vercel','.git','.venv'} for part in Path(name).parts):continue
    if path.name.startswith('.env') and path.name!='.env.example':raise RuntimeError('Environment file reached source packaging')
    if name.startswith('verification/implementation-vitest') and name.endswith('.json'):continue
    data=path.read_bytes()
    if any(secret in data for secret in private):raise RuntimeError('Private credential detected in '+name)
    entries.append((name,data))
required={'verification/fixtures/upstream-budget-model.js','verification/build_feature_register.py',
          'verification/current-suno-schema-inventory.json','verification/implementation-summary.json',
          'verification/incremental-rehearsal.json','verification/suno-incremental-review.sql'}
if not required.issubset({name for name,_ in entries}):raise RuntimeError('Required verification inputs are missing from the source package')
target=folder/'Suno-System-Audited.zip'
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for name,data in entries:archive.writestr('suno-system/'+name,data)
report={'created_at':dt.datetime.now(dt.timezone.utc).isoformat(),'archive':str(target),'files':len(entries),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'private_credentials_detected':0,'live_deployment':False}
(folder/'Package-Manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
