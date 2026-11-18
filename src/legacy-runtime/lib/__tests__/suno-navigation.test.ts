import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { activeSunoItem, sunoLocation, sunoNavigation } from '../suno-navigation';

it('keeps every existing dashboard feature reachable without placeholder routes', () => {
    const items = sunoNavigation.flatMap(group => group.items), paths = items.map(item => item.href);
    expect(new Set(paths).size).toBe(paths.length);
    const directory = 'src/legacy-runtime/app/dashboard';
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(directory, entry.name, 'page.tsx'))) expect(paths).toContain('/dashboard/' + entry.name);
    }
    for (const path of paths) expect(existsSync(join('src/legacy-runtime/app', path, 'page.tsx'))).toBe(true);
    expect(paths).toContain('/dashboard/connect');
    expect(paths.some(path => path.includes('ui-preview') || path.includes('workspace'))).toBe(false);
});

it('marks one current item and labels each destination correctly', () => {
    const items = sunoNavigation.flatMap(group => group.items);
    for (const item of items) {
        expect(items.filter(candidate => activeSunoItem(candidate.href, item.href))).toHaveLength(1);
        expect(sunoLocation(item.href).label).toBe(item.label);
    }
    expect(sunoLocation('/dashboard/contacts/client').label).toBe('Contacts');
});
