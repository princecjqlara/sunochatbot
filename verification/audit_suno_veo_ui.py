"""Compare committed Veo UI/source with Suno; report coverage without claiming live parity."""
import argparse
import datetime
import io
import json
import re
import subprocess
import zipfile
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--veo-root', required=True)
args = parser.parse_args()
source = Path(args.veo_root).resolve()

def git(root, *arguments, binary=False):
    return subprocess.check_output(['git', '-C', str(root), *arguments], text=not binary)

source_commit = git(source, 'rev-parse', 'HEAD').strip()
target_commit = git(ROOT, 'rev-parse', 'HEAD').strip()
archive_bytes = git(source, 'archive', '--format=zip', source_commit, 'src', 'supabase/migrations', binary=True)
with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
    source_files = {name: archive.read(name) for name in archive.namelist() if not name.endswith('/')}

target_names = git(ROOT, 'ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase/migrations').splitlines()
target_files = {name: (ROOT / name).read_bytes() for name in target_names}

def normalized(body):
    return body.decode('utf-8-sig').replace('\r\n', '\n')

def runtime(name):
    return name.endswith(('.ts', '.tsx', '.css', '.json')) and not re.search(r'(?:\.test\.|/__tests__/)', name)

def coverage(predicate):
    expected = sorted(name for name in source_files if predicate(name))
    actual = sorted(name for name in target_files if predicate(name))
    return {'source_count': len(expected), 'suno_count': len(actual),
            'missing_in_suno': sorted(set(expected) - set(actual)),
            'suno_additions': sorted(set(actual) - set(expected)),
            'different_files': [name for name in expected if name in target_files and normalized(source_files[name]) != normalized(target_files[name])]}

navigation_code = "import {dashboardNavigation} from './src/lib/veo-navigation.ts'; console.log(JSON.stringify(Object.fromEntries(['owner','team_leader','manager','member'].map(role=>[role,dashboardNavigation(role)]))));"
navigation = json.loads(subprocess.check_output(['node', '--experimental-strip-types', '--input-type=module', '-e', navigation_code], cwd=ROOT, text=True, stderr=subprocess.PIPE))
preview = []
for group in navigation['owner']:
    for item in group['items']:
        target = urlsplit(item['href'])
        view = parse_qs(target.query).get('view', [''])[0]
        kind = ('shared_team_component_with_sample_data' if target.path == '/dashboard/workspace' and not view
                else 'custom_sample_table' if target.path == '/dashboard/contacts' or view == 'new_clients'
                else 'placeholder')
        preview.append({**item, 'group': group['name'], 'implementation': kind, 'live_data_connected': False})

def classes(text):
    return set(re.findall(r'className="([^"]+)"', text))

source_layout = normalized(source_files['src/app/dashboard/layout.tsx'])
suno_layout = normalized(target_files['src/app/dashboard/layout.tsx']) + normalized(target_files['src/components/WorkspaceShell.tsx'])
anchors = ['src/app/globals.css', 'src/lib/veo-navigation.ts']
report = {
    'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'read_only': True,
    'source_commit': source_commit,
    'suno_commit': target_commit,
    'source_uncommitted_paths_excluded': git(source, 'status', '--porcelain').splitlines(),
    'api_routes': coverage(lambda name: name.startswith('src/app/api/') and name.endswith('/route.ts')),
    'pages': coverage(lambda name: name.startswith('src/app/') and name.endswith('/page.tsx')),
    'components': coverage(lambda name: name.startswith('src/components/') and name.endswith('.tsx') and '.test.' not in name),
    'runtime_source': coverage(lambda name: name.startswith('src/') and runtime(name)),
    'migrations': coverage(lambda name: name.startswith('supabase/migrations/') and name.endswith('.sql')),
    'ui_anchors_identical': {name: normalized(source_files[name]) == normalized(target_files[name]) for name in anchors},
    'original_dashboard_class_strings_missing': sorted(classes(source_layout) - classes(suno_layout)),
    'navigation_destinations': {role: sum(len(group['items']) for group in groups) for role, groups in navigation.items()},
    'owner_preview': {'destinations': len(preview), 'placeholders': sum(item['implementation'] == 'placeholder' for item in preview), 'live_data_connected': False, 'items': preview},
    'live_feature_parity_verified': False,
    'limits': ['Source presence does not prove a working feature.', 'Uncommitted upstream edits were not merged.', 'The public preview is not the authenticated workspace.', 'No customer records were read or changed by this source audit.']
}
destination = ROOT / 'verification/ui-feature-parity-audit.json'
destination.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: report[key] for key in ['source_commit', 'suno_commit', 'ui_anchors_identical', 'original_dashboard_class_strings_missing', 'navigation_destinations', 'live_feature_parity_verified']}))
for key in ['api_routes', 'pages', 'components', 'runtime_source', 'migrations']:
    entry = report[key]
    print(json.dumps({'area': key, **{name: entry[name] for name in ['source_count', 'suno_count', 'missing_in_suno', 'suno_additions']}, 'different_file_count': len(entry['different_files'])}))
print(json.dumps({'owner_preview_destinations': len(preview), 'placeholders': report['owner_preview']['placeholders'], 'sample_views': len(preview) - report['owner_preview']['placeholders'], 'report': str(destination.relative_to(ROOT))}))
