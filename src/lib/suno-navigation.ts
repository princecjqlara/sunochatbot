import {dashboardNavigation as inheritedNavigation,activeDashboardItem,type NavigationItem} from './veo-navigation';
export {activeDashboardItem};
export function dashboardNavigation(role?:string){
 const groups=inheritedNavigation(role).map(g=>({...g,items:g.items.filter(i=>!['deals','receipts','salary','capacity','calendar','budget','performance','rankings'].includes(new URL(i.href,'https://suno.invalid').searchParams.get('view')||''))}));
 const sales=groups.find(g=>g.name==='Sales')!;
 const area=(view:string,label:string):NavigationItem=>({href:'/dashboard/workspace?view='+view,label,icon:'chart'});
 sales.items.unshift(area('sales','Sales & payments'),area('salary','Earnings'));
 let reports=groups.find(g=>g.name==='Reports');
 if(!reports){reports={name:'Reports',items:[]};groups.push(reports);}
 reports.items=reports.items.filter(i=>i.href!=='/dashboard/ad-calendar');
 reports.items.unshift(area('calendar','Sales calendar'));
 if(role!=='member')reports.items.push(area('performance','Staff earnings'));
 for(const group of groups)group.items=group.items.map(i=>i.href==='/dashboard/workspace'?{...i,label:'Suno dashboard'}:i.href.endsWith('view=new_clients')?{...i,label:'Song assignments'}:i);
 return groups.filter(g=>g.items.length);
}
export function dashboardLocation(role:string|undefined,pathname:string,search:Pick<URLSearchParams,'get'>){
 for(const group of dashboardNavigation(role)){const current=group.items.find(i=>activeDashboardItem(i.href,pathname,search));if(current)return {group:group.name,label:pathname.startsWith('/dashboard/contacts/')?'Contact profile':current.label};}
 return {group:'Workspace',label:pathname.split('/').filter(Boolean).pop()?.replaceAll('-',' ')||'Dashboard'};
}
