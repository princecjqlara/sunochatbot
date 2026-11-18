'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, Search, Users } from 'lucide-react';
import WorkspaceShell from './WorkspaceShell';
import VeoTeamsDashboard from './VeoTeamsDashboard';
import { dashboardLocation } from '@/lib/veo-navigation';
import { workspacePreviewHref, workspacePreviewTarget } from '@/lib/workspace-preview';

// Fictional records only. This preview never imports a data service or fetches a workspace API.
const sampleTeams = {
    accounts: [
        { id: 'sample-leader-a', name: 'Sample team leader A', role: 'team_leader', active: true },
        { id: 'sample-leader-b', name: 'Sample team leader B', role: 'team_leader', active: true },
        { id: 'sample-worker-a', name: 'Sample worker A', role: 'member', parent_id: 'sample-leader-a', active: true },
        { id: 'sample-worker-b', name: 'Sample worker B', role: 'member', parent_id: 'sample-leader-a', active: true },
        { id: 'sample-worker-c', name: 'Sample worker C', role: 'member', parent_id: 'sample-leader-b', active: true }
    ],
    teams: [
        { id: 'sample-team-a', name: 'Sample Suno team A', manager_id: 'sample-leader-a' },
        { id: 'sample-team-b', name: 'Sample Suno team B', manager_id: 'sample-leader-b' }
    ],
    salary: [], tomorrow: []
};
const sampleContacts = [
    { id: 'sample-client-001', name: 'Sample client A', page: 'Sample Suno Page', stage: 'New inquiry', details: 'Birthday song' },
    { id: 'sample-client-002', name: 'Sample client B', page: 'Sample Suno Page', stage: 'Details collected', details: 'Anniversary song' },
    { id: 'sample-client-003', name: 'Sample client C', page: 'Sample music Page', stage: 'In progress', details: 'Personal dedication' }
];

export default function WorkspacePreview() {
    const search = useSearchParams();
    const target = workspacePreviewTarget(search.get('page'));
    const location = dashboardLocation('owner', target.pathname, target.searchParams);
    const home = target.pathname === '/dashboard/workspace' && !target.searchParams.has('view');
    const contacts = target.pathname === '/dashboard/contacts' || target.searchParams.get('view') === 'new_clients';
    const [query, setQuery] = useState('');
    const filteredContacts = sampleContacts.filter(contact => Object.values(contact).join(' ').toLowerCase().includes(query.toLowerCase().trim()));

    return <WorkspaceShell user={{ name: 'Preview account', email: 'Sample Owner view', role: 'owner' }} preview>
        <div className="dashboard-page">
            <div role="note" className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
                <Eye aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                <div><p className="font-semibold">Workspace UI preview</p><p className="mt-1 leading-6">Sample data only. Explore the Veo-style navigation and team layout while Suno setup continues.</p></div>
            </div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">SUNO workspace</p><h1>{location.label}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{home ? 'Your teams, results and work plans in one place.' : contacts ? 'Find your clients and keep their song details together.' : 'A preview of this workspace section.'}</p></div>
            {home ? <VeoTeamsDashboard data={sampleTeams} linkHref={workspacePreviewHref} /> : contacts ? <section className="wireframe-card space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-bold">Sample clients</h2><label className="relative w-full sm:w-80"><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" aria-label="Search sample clients" placeholder="Search clients, Pages or song details…" value={query} onChange={event => setQuery(event.target.value)} className="input-wireframe pl-9" /></label></div>
                <div className="overflow-x-auto"><table className="table-wireframe"><thead><tr>{['Client', 'Page', 'Stage', 'Song details'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{filteredContacts.map(contact => <tr key={contact.id}><td><p className="font-semibold">{contact.name}</p><p className="mt-1 text-xs text-slate-500">{contact.id}</p></td><td>{contact.page}</td><td><span className="badge-wireframe border-indigo-100 bg-indigo-50 text-indigo-800">{contact.stage}</span></td><td>{contact.details}</td></tr>)}</tbody></table></div>
                <p role="status" className="text-sm text-slate-500">{filteredContacts.length ? `${filteredContacts.length} sample clients` : 'No sample clients match your search.'}</p>
            </section> : <section className="wireframe-card flex flex-col items-center py-14 text-center sm:py-20">
                <span className="mb-5 rounded-2xl bg-slate-100 p-4"><Users aria-hidden="true" className="h-7 w-7 text-slate-500" /></span>
                <h2 className="text-xl font-bold">{location.label}</h2><p className="mt-3 max-w-md text-sm leading-6 text-slate-500">Live tools for this section will be available when Suno setup is complete. Preview the shared layout using the teams dashboard or sample client list.</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/ui-preview" className="btn-wireframe-dark">Teams dashboard</Link><Link href={workspacePreviewHref('/dashboard/contacts')} className="btn-wireframe">Sample clients</Link></div>
            </section>}
        </div>
    </WorkspaceShell>;
}
