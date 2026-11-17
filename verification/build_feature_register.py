"""Read source metadata and generate planning registers; never call app workers."""
from pathlib import Path
import datetime
import ast
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent.parent
FEATURES = {
    'F01': 'Sign-in, personal profile and access boundary',
    'F02': 'Tenant isolation, accounts, teams, supervisors and offboarding',
    'F03': 'Facebook Pages, OAuth and connection ownership',
    'F04': 'Dashboard and workspace context',
    'F05': 'Contacts, search, filters and bulk contact operations',
    'F06': 'Contact profile identity and editable details',
    'F07': 'Contact conversation history, summaries and evidence',
    'F08': 'Contact orders, verified payments and financial metrics',
    'F09': 'Contact/ad attribution and Facebook source verification',
    'F10': 'Contact demographics, intelligence and projections',
    'F11': 'Marketing calendar and inquiry cohorts',
    'F12': 'Work calendar and earnings calendar',
    'F13': 'Ad accounts, spend, performance and synchronization',
    'F14': 'Page budgets and Page-level planning',
    'F15': 'Creative inventory and creative performance',
    'F16': 'Suno song brief and saved form answers',
    'F17': 'Chatbot settings, generation, trials and analytics',
    'F18': 'Knowledge, media, Drive and sample delivery',
    'F19': 'Packages, pricing, free offers and customer-specific staff quotes',
    'F20': 'Human handoff, bot permissions and guarded sending',
    'F21': 'Follow-ups, best contact time and workflow automation',
    'F22': 'Pipeline, contact tags and outcome synchronization',
    'F23': 'Ready/Busy, assignments, offers and handovers',
    'F24': 'Song production, work deadlines and completion',
    'F25': 'Receipt evidence, review, order milestones and corrections',
    'F26': 'Earnings, statements, referral/recruiter tracking and incentives',
    'F27': 'Attendance, availability, Page access surveys, capacity and quotas',
    'F28': 'Staff profiles, performance, rankings, concerns and alerts',
    'F29': 'Jaucian, Telegram identities, groups and topics',
    'F30': 'Campaigns, loops and tracked bulk messaging',
    'F31': 'Templates and welcome messages',
    'F32': 'Exports, history and archived access',
    'F33': 'Event ingestion, identity collection and sync',
    'F34': 'Shared navigation, accessibility and loading behavior',
    'F35': 'Operations, worker health and diagnostics',
    'F36': 'Schema, retention, storage lifecycle and recovery',
}

CRONS = {
    'campaign-loop': 'F30', 'campaign-scheduled': 'F30', 'chatbot': 'F21',
    'contact-identities': 'F33', 'contact-profiles': 'F07', 'database-health': 'F35',
    'editor-dispatch': 'F23', 'exports': 'F32', 'follow-up-automations': 'F21',
    'incentives': 'F26', 'inquiry-history': 'F33', 'messaging-auto-tag': 'F22',
    'meta-ads-sync': 'F13', 'quotas': 'F27', 'sync': 'F33',
    'workspace': 'F35', 'workspace-events': 'F33',
}

WORKSPACE = {
    '': 'F04', 'context': 'F04', 'account-access': 'F02', 'ads': 'F13',
    'archive': 'F32', 'autotag': 'F22', 'budget': 'F14', 'business-orders': 'F25',
    'calendar': 'F12', 'contacts': 'F05', 'contacts/sync': 'F33', 'creatives': 'F15',
    'deal-reviews': 'F25', 'deal-reviews/upload': 'F25', 'demographics': 'F10',
    'employee-profile': 'F28', 'handoff': 'F29', 'incentives': 'F26',
    'jaucian': 'F29', 'new-clients': 'F23', 'operations': 'F24', 'pages': 'F03',
    'profile': 'F01', 'profile/telegram-link': 'F29', 'profile-details': 'F06',
    'quota-policy': 'F27', 'receipts': 'F25', 'source': 'F09',
    'storage-health': 'F35', 'telegram-groups': 'F29', 'warnings': 'F28',
}

PAGES = {
    '/': 'F01', '/vintage': 'F01', '/sales-form': 'F16', '/dashboard': 'F04', '/ui-preview': 'F34',
    '/dashboard/7-day-contacts': 'F05', '/dashboard/ad-calendar': 'F11',
    '/dashboard/ad-quality': 'F13', '/dashboard/automations': 'F21',
    '/dashboard/campaigns': 'F30', '/dashboard/chatbot': 'F17',
    '/dashboard/connect': 'F03', '/dashboard/contacts': 'F05',
    '/dashboard/contacts/[contactId]': 'F06', '/dashboard/exports': 'F32',
    '/dashboard/history': 'F32', '/dashboard/pipeline': 'F22',
    '/dashboard/pricing': 'F19', '/dashboard/settings': 'F35',
    '/dashboard/tags': 'F22', '/dashboard/templates': 'F31',
    '/dashboard/welcome': 'F31', '/dashboard/workspace': 'F04',
}

COMPONENTS = {
    'AdCreativePreview': 'F15', 'ChatbotSalesSettings': 'F16',
    'ContactBotProjection': 'F10', 'ContactSources': 'F09',
    'ConversionPerformance': 'F13', 'FacebookConnectButton': 'F03',
    'LeadQualityBadge': 'F10', 'Modal': 'F34', 'Pagination': 'F34',
    'Providers': 'F34', 'Toast': 'F34', 'VeoAccountAccess': 'F02',
    'VeoAccountLoginSetup': 'F01', 'VeoAdPerformanceChart': 'F13',
    'VeoAdsConnection': 'F13', 'VeoAutoTagStatus': 'F22',
    'VeoBusinessOrderPicker': 'F25', 'VeoCapacitySummary': 'F27',
    'VeoClientDrawer': 'F06', 'VeoContactAutoFill': 'F06',
    'VeoContactDemographics': 'F10', 'VeoContactDetails': 'F08',
    'VeoContactIdentitySync': 'F33', 'VeoContactTags': 'F22',
    'VeoCreativePerformance': 'F15', 'VeoDashboardBreadcrumb': 'F34',
    'VeoDashboardNavigation': 'F34', 'VeoDealEvidenceInbox': 'F25',
    'VeoDealIncentive': 'F26', 'VeoDeferredSection': 'F34',
    'VeoEmployeeProfile': 'F28', 'VeoJaucianIntegration': 'F29',
    'VeoMemberSupervisors': 'F02', 'VeoNewClients': 'F23',
    'VeoOperationsPanel': 'F24', 'VeoPageBudget': 'F14',
    'VeoPageConnections': 'F03', 'VeoPageState': 'F34',
    'VeoQuotaPolicy': 'F27', 'VeoReceiptInbox': 'F25',
    'VeoReceiptSaleDetails': 'F25', 'VeoSalaryStatement': 'F26',
    'VeoSignIn': 'F01', 'VeoStaffOffboarding': 'F02',
    'VeoStaffPerformance': 'F28', 'VeoStaffWarnings': 'F28',
    'VeoStorageHealth': 'F35', 'VeoSupervisorGroups': 'F02',
    'VeoTeamsDashboard': 'F04', 'VeoTelegramGroups': 'F29',
    'VeoTelegramLink': 'F29', 'VeoTelegramProfile': 'F01',
    'VeoTelegramReminder': 'F29', 'VeoWorkCalendar': 'F12',
    'VeoWorkforceReadiness': 'F27', 'VeoWorkspaceContacts': 'F05',
    'WorkspacePreview': 'F34', 'WorkspaceShell': 'F34',
}

BOT_ROUTES = {
    '/api/veo/workspace': ('F29', 'Delegated handler', False),
    '/api/veo/handoff': ('F25', 'POST', False),
    '/api/status': ('F35', 'GET', False), '/api/health': ('F35', 'GET', False),
    '/api/messages': ('F07', 'GET', False), '/api/workers/activity': ('F28', 'GET', False),
    '/api/groups': ('F29', 'GET', False), '/api/freebies/status': ('F19', 'GET', False),
    '/api/new-clients/status': ('F23', 'GET', False),
    '/api/new-clients/suno-supply': ('F23', 'GET', True),
    '/api/clients': ('F23', 'GET', False), '/api/workers/capacity': ('F27', 'GET', True),
    '/api/referrals/status': ('F26', 'GET', False), '/api/referrals/audit': ('F26', 'GET', False),
    '/api/reports/plan': ('F27', 'GET', True), '/api/reports/replace': ('F28', 'POST', True),
    '/api/reports/daily-summary': ('F26', 'GET', False),
    '/api/reports/concerns': ('F28', 'GET', False), '/api/reports/warnings': ('F28', 'GET', False),
    '/api/reports/topics': ('F29', 'GET', False), '/api/reports/members': ('F28', 'GET', True),
    '/api/reports/surveys': ('F27', 'POST', False), '/api/reports/workload': ('F27', 'GET, POST', False),
    '/api/suno/makata': ('F29', 'GET, POST', True),
    '/api/schedules': ('F35', 'GET, POST, DELETE', False), '/api/scheduler': ('F35', 'GET, POST', False),
    '/api/cron/dispatch': ('F29', 'GET', False), '/api/webhook': ('F29', 'POST', False),
}

DATA_OWNERS = {
    'business_users': 'F02', 'businesses': 'F02', 'campaign_delivery_failures': 'F30',
    'campaign_recipients': 'F30', 'campaigns': 'F30', 'chatbot_configs': 'F17',
    'chatbot_contact_states': 'F16/F19/F20/F21', 'chatbot_drive_files': 'F18',
    'chatbot_drive_folders': 'F18', 'chatbot_follow_up_jobs': 'F21',
    'chatbot_interruption_events': 'F20', 'chatbot_knowledge_chunks': 'F18',
    'chatbot_knowledge_documents': 'F18', 'chatbot_media_assets': 'F18',
    'chatbot_message_deliveries': 'F20/F21', 'chatbot_reply_events': 'F20',
    'contact_tags': 'F22', 'contacts': 'F05/F06', 'conversation_export_jobs': 'F32',
    'outbound_message_events': 'F20/F30', 'page_activity_history': 'F32',
    'page_sync_leases': 'F33', 'pages': 'F03', 'tag_shares': 'F22', 'tags': 'F22',
    'user_pages': 'F02/F03', 'users': 'F01', 'welcome_messages': 'F31',
    'workflow_automation_states': 'F21', 'workflow_automations': 'F21',
    'contact_interactions': 'F21',
}

def classify(route):
    if route.startswith('/api/cron/'):
        return CRONS[route.removeprefix('/api/cron/')]
    if route.startswith('/api/workspace'):
        return WORKSPACE[route.removeprefix('/api/workspace').strip('/')]
    if route.startswith('/api/ad-calendar'):
        return 'F11'
    if route.startswith('/api/ad-quality'):
        return 'F13'
    if route.startswith('/api/auth/'):
        return 'F01'
    if route.startswith('/api/campaigns'):
        return 'F30'
    if route.startswith('/api/exports'):
        return 'F32'
    if route.startswith('/api/chatbot-media/') or route == '/api/media/photo-header':
        return 'F18'
    if route == '/api/sales-form':
        return 'F16'
    if route == '/api/telegram/webhook':
        return 'F29'
    if route == '/api/tags' or route.startswith('/api/tags/') or route == '/api/settings/messaging-auto-tag':
        return 'F22'
    if route.startswith('/api/test-') or route == '/api/check-oauth-config':
        return 'F35'
    if route.startswith('/api/facebook/'):
        name = route.removeprefix('/api/facebook/')
        if name in {'webhook', 'partner-webhook'}:
            return 'F33'
        if name.startswith('templates'):
            return 'F31'
        if name == 'messages/send':
            return 'F20'
        if name in {'authorize', 'connect', 'pages'}:
            return 'F03'
    if route == '/api/pages':
        return 'F03'
    if route.startswith('/api/pages/[pageId]/'):
        suffix = route.removeprefix('/api/pages/[pageId]/')
        if suffix.startswith('chatbot'):
            tail = suffix.removeprefix('chatbot').strip('/')
            if tail in {'knowledge', 'media', 'folders'}:
                return 'F18'
            if tail == 'pricing':
                return 'F19'
            if tail == 'follow-ups':
                return 'F21'
            if tail == 'interruptions':
                return 'F20'
            if tail in {'', 'trial', 'analytics'}:
                return 'F17'
        if suffix.startswith('contacts/[contactId]/'):
            tail = suffix.removeprefix('contacts/[contactId]/')
            return {'bot': 'F20', 'profile': 'F06', 'profile/finance': 'F08',
                    'profile/messages': 'F07', 'profile/sources': 'F09', 'projection': 'F10'}[tail]
        if suffix.startswith('contacts'):
            tail = suffix.removeprefix('contacts').strip('/')
            return {'': 'F05', 'bulk': 'F05', 'best-time': 'F21', 'bulk-add-tags': 'F22',
                    'bulk-remove-tags': 'F22', 'tracked-bulk-message': 'F30'}[tail]
        if suffix.startswith('automations'):
            return 'F21'
        if suffix in {'human-agent-media', 'human-agent-send'}:
            return 'F20'
        return {'conversations/export': 'F32', 'exports': 'F32', 'history': 'F32',
                'pipeline': 'F22', 'sync': 'F33', 'team': 'F02', 'webhook': 'F03', 'welcome': 'F31'}[suffix]
    raise ValueError('Route needs explicit review: ' + route)

def fingerprint(file):
    return hashlib.sha256(file.read_bytes().replace(b'\r\n', b'\n')).hexdigest()

config = json.loads((ROOT/'vercel.json').read_text())
schedules = {row['path']: row['schedule'] for row in config.get('crons', [])}
routes = []
for p in sorted((ROOT/'src/app/api').rglob('route.ts')):
    route = '/api/' + p.parent.relative_to(ROOT/'src/app/api').as_posix()
    s = p.read_text(encoding='utf-8-sig')
    methods = sorted(set(re.findall(r'export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b', s)))
    if not methods and 'NextAuth' in s:
        methods = ['GET', 'POST']
    routes.append({'route': route, 'feature': classify(route), 'source': p.relative_to(ROOT).as_posix(),
                   'methods': methods, 'declared_schedule_utc': schedules.get(route),
                   'direct_rpc_names': sorted(set(re.findall(r"\.rpc\(\s*['\"]([^'\"]+)", s))),
                   'direct_table_names': sorted(set(re.findall(r"\.from\(\s*['\"]([^'\"]+)", s))),
                   'source_sha256': fingerprint(p), 'implementation_status': 'planning_only',
                   'compatibility_verified': False})
pages = []
for p in sorted((ROOT/'src/app').rglob('page.tsx')):
    suffix = p.parent.relative_to(ROOT/'src/app').as_posix()
    route = '/' if suffix == '.' else '/' + suffix
    pages.append({'route': route, 'feature': PAGES[route], 'source': p.relative_to(ROOT).as_posix(),
                  'source_sha256': fingerprint(p), 'compatibility_verified': False})
components = []
for p in sorted((ROOT/'src/components').glob('*.tsx')):
    if '.test.' in p.name:
        continue
    components.append({'component': p.name, 'feature': COMPONENTS[p.stem],
                       'source': p.relative_to(ROOT).as_posix(), 'source_sha256': fingerprint(p),
                       'compatibility_verified': False})
cron_rows = [row for row in routes if row['route'].startswith('/api/cron/')]
live = json.loads((ROOT/'verification/current-suno-schema-inventory.json').read_text())
bot_source = (ROOT/'jaucian/app.py').read_text(encoding='utf-8-sig')
bot_app = next(n for n in ast.parse(bot_source).body if isinstance(n, ast.FunctionDef) and n.name == 'app')
bot_paths = set()
for n in ast.walk(bot_app):
    if not isinstance(n, ast.Compare) or not any(isinstance(op, ast.Eq) for op in n.ops):
        continue
    left = n.left
    is_path = isinstance(left, ast.Name) and left.id == 'path'
    is_path = is_path or (isinstance(left, ast.Call) and isinstance(left.func, ast.Attribute)
              and left.func.attr == 'get' and isinstance(left.func.value, ast.Name)
              and left.func.value.id == 'environ' and left.args
              and isinstance(left.args[0], ast.Constant) and left.args[0].value == 'PATH_INFO')
    if is_path:
        bot_paths.update(v.value for v in n.comparators if isinstance(v, ast.Constant) and isinstance(v.value, str))
assert bot_paths == set(BOT_ROUTES), 'Bot routes need explicit review: ' + repr(bot_paths ^ set(BOT_ROUTES))
bot_rows = [{'route': p, 'feature': BOT_ROUTES[p][0], 'methods': BOT_ROUTES[p][1],
             'blocked_by_workspace_mode_410': BOT_ROUTES[p][2], 'compatibility_verified': False}
            for p in sorted(bot_paths)]
for column in live['columns']:
    assert column['table_name'] in DATA_OWNERS, 'Data relation needs explicit owner: ' + column['table_name']
assert len(routes) == 125 and len(pages) == 23 and len(cron_rows) == 17
assert sum(row['declared_schedule_utc'] is not None for row in cron_rows) == 16
report = {'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'scope': 'Source coverage and planning only; no functional parity claim',
          'features': FEATURES, 'api_routes': routes, 'pages': pages, 'components': components,
          'cron_routes': cron_rows, 'bot_routes': bot_rows, 'counts': {'api_routes': len(routes), 'pages': len(pages),
          'components': len(components), 'cron_routes': len(cron_rows), 'scheduled_in_vercel': 16,
          'not_scheduled_in_vercel': 1, 'bot_routes': len(bot_rows), 'current_data_column_records': len(live['columns']), 'unclassified': 0},
          'current_suno_schema': {'read_only': True, 'public_tables': len(live['tables']),
          'column_records': len(live['columns']), 'public_function_names': len(live['functions']),
          'trigger_event_records': len(live['triggers']), 'database_crons': live['database_crons']},
          'manual_crosscutting_coverage_required': ['shared libraries and indirect dependencies',
          'workspace subviews and action branches', 'SQL triggers, functions, caches and retention',
          'external schedulers and deployed configuration', 'Suno-specific legacy helper behaviors',
          'Telegram Python routes and dispatcher branches']}
(ROOT/'docs/suno-feature-coverage.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
out = ['# Suno route and component coverage register', '',
       'Planning inventory. A mapped path is not a verified working feature. All entries still need their master-plan acceptance checks.', '',
       f"Coverage: {len(routes)} API routes, {len(pages)} page routes, {len(components)} non-test top-level UI components, 17 cron routes; zero unclassified paths in these sets.", '',
       '## Feature IDs', '', '| ID | Area |', '| --- | --- |']
out += [f'| {k} | {v} |' for k, v in FEATURES.items()]
out += ['', '## API routes', '', '| Route | Methods | Primary feature | Source |', '| --- | --- | --- | --- |']
out += [f"| `{r['route']}` | {', '.join(r['methods']) or 'Review export binding'} | {r['feature']} | `{r['source']}` |" for r in routes]
out += ['', '## Pages', '', '| Page | Primary feature |', '| --- | --- |']
out += [f"| `{r['route']}` | {r['feature']} |" for r in pages]
out += ['', '## UI components', '', '| Component | Primary feature |', '| --- | --- |']
out += [f"| `{r['component']}` | {r['feature']} |" for r in components]
out += ['', '## Python bot routes', '',
        'These are explicit app-router paths. Delegated resource/action branches and mode-specific behavior still require functional tests.', '',
        '| Bot route | Methods | Feature | Current workspace mode |', '| --- | --- | --- | --- |']
out += [f"| `{r['route']}` | {r['methods']} | {r['feature']} | {'Blocked with 410; replacement required' if r['blocked_by_workspace_mode_410'] else 'Handler/mode verification required'} |" for r in bot_rows]
out += ['', '## Crosscutting review', '',
        'The master plan separately covers shared libraries, indirect RPCs/tables, workspace subviews/actions, Python Telegram routes, SQL jobs/triggers, feature flags, historical data and external schedules. Diagnostic endpoints and the vintage page are classified for explicit retention/restriction decisions; this register does not make them business features or approve exposing them.', '',
        'Regenerate after any upstream changes. An unknown API/page/component name fails this generator rather than disappearing into an unnamed catch-all category.', '']
(ROOT/'docs/suno-route-register.md').write_text('\n'.join(out), encoding='utf-8')
field_doc = ['# Current Suno field preservation register', '',
             'Read-only schema metadata snapshot; no customer rows or credentials. Feature IDs refer to the compatibility master plan.', '',
             'Each existing field has a retain/reconcile requirement. This is not an approved transform/drop/rename script. Final types, defaults, constraints, functions and triggers must be reconciled during the database rehearsal.', '']
tables = {row['tablename'] for row in live['tables']}
for name in sorted({row['table_name'] for row in live['columns']}):
    cols = [row for row in live['columns'] if row['table_name'] == name]
    field_doc += [f'## {name}', '',
                  f"Primary coverage: {DATA_OWNERS[name]}. Relation: {'public base table' if name in tables else 'not listed as a public base table; view/compatibility relation requires inspection'}.", '',
                  '| Field | Existing data type | Nullable | Planned disposition |', '| --- | --- | --- | --- |']
    field_doc += [f"| `{c['column_name']}` | `{c['data_type']}` | {c['is_nullable']} | Retain/reconcile; no mutation approved |" for c in cols]
    field_doc += ['']
field_doc += ['## Existing function names', '', 'Preserve or explicitly supersede after signature/definition/access checks; names alone are not proof of equivalence.', '']
field_doc += [f"- `{name}`" for name in live['functions']]
field_doc += ['', '## Existing trigger events', '', '| Relation | Trigger | Timing | Event |', '| --- | --- | --- | --- |']
field_doc += [f"| `{r['event_object_table']}` | `{r['trigger_name']}` | {r['action_timing']} | {r['event_manipulation']} |" for r in live['triggers']]
field_doc += ['', 'The baseline includes the `contact_interactions` relation outside the public base-table listing. Do not assume a missing pg_tables entry means activity data is absent or create a conflicting table over a compatibility view.', '']
(ROOT/'docs/suno-current-data-field-register.md').write_text('\n'.join(field_doc), encoding='utf-8')
print(json.dumps(report['counts']))
