import {dashboardNavigation as inheritedNavigation,activeDashboardItem,type NavigationItem} from './veo-navigation';
export {activeDashboardItem};
export function dashboardNavigation(role?:string){
 const groups=inheritedNavigation(role).map(g=>({...g,items:g.items.filter(i=>!['deals','receipts','salary'].includes(new URL(i.href,'https://suno.invalid').searchParams.get('view')||''))}));
 const sales=groups.find(g=>g.name==='Sales')!;
 const area=(view:string,label:string):NavigationItem=>({href:'/dashboard/workspace?view='+view,label,icon:'chart'});
 groups.find(g=>g.name==='Work')!.items.push(area('songs','Song work & revisions'));
 sales.items.unshift(area('sales','Sales & payments'),area('salary','Earnings'));
 let reports=groups.find(g=>g.name==='Reports');
 if(!reports){reports={name:'Reports',items:[]};groups.push(reports);}
 reports.items=reports.items.map(i=>i.href.endsWith('view=calendar')?{...i,label:'Sales & work calendar'}:i.href.endsWith('view=performance')?{...i,label:'Staff performance'}:i.href.endsWith('view=rankings')?{...i,label:'Staff rankings'}:i);
 if(!reports.items.some(i=>i.href.endsWith('view=calendar')))reports.items.unshift(area('calendar','Sales & work calendar'));
 if(['owner','team_leader'].includes(role||''))reports.items.unshift({href:'/dashboard/insights',label:'Business Insights',icon:'chart'});
 for(const group of groups)group.items=group.items.map(i=>i.href==='/dashboard/workspace'?{...i,label:'Suno dashboard'}:i.href.endsWith('view=new_clients')?{...i,label:'Song assignments'}:i);
 return groups.filter(g=>g.items.length);
}
export function dashboardLocation(role:string|undefined,pathname:string,search:Pick<URLSearchParams,'get'>){
 for(const group of dashboardNavigation(role)){const current=group.items.find(i=>activeDashboardItem(i.href,pathname,search));if(current)return {group:group.name,label:pathname.startsWith('/dashboard/contacts/')?'Contact profile':current.label};}
 return {group:'Workspace',label:pathname.split('/').filter(Boolean).pop()?.replaceAll('-',' ')||'Dashboard'};
}
