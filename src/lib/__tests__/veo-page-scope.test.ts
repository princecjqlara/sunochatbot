import {afterEach,expect,it,vi} from 'vitest';
import {filterVeoPages,isApprovedVeoPage} from '../veo-page-scope';
afterEach(()=>{vi.unstubAllEnvs();});
it('uses Suno IDs and rejects Veo pages and display-name guesses',()=>{
 expect(isApprovedVeoPage('697291860141214','Renamed')).toBe(true);
 expect(isApprovedVeoPage('999','Hiraya Studio')).toBe(false);
 expect(isApprovedVeoPage('656646850875530','Azshinari')).toBe(false);
 expect(isApprovedVeoPage('999',' AIkita   Studio ')).toBe(false);
 expect(isApprovedVeoPage('999','Tokko')).toBe(false);
});
it('limits the picker to Suno pages',()=>{
 vi.stubEnv('VEO_PAGE_SCOPE_ENFORCED','true');
 expect(filterVeoPages([{id:'697291860141214',name:'Hiraya Studio'},{id:'656646850875530',name:'Azshinari'},{id:'999',name:'Other'}])).toEqual([{id:'697291860141214',name:'Hiraya Studio'}]);
});
