const labels: Record<string,string> = {
 general:'General',announcements:'Announcements',active:'Active tomorrow',clients:'Clients',
 receipts:'Receipts',close:'Closed Deals',done:'Done Deals',songs:'Songs',
};

export default function TelegramTopicRoutes({chatId,topics}:{chatId:number|string;topics?:Record<string,unknown>}) {
 if(!Number.isSafeInteger(Number(chatId))||Number(chatId)>=0)return null;
 const destinations=new Map<number,string[]>();
 for(const [role,label] of Object.entries(labels)) {
  const value=topics?.[role],id=Number(value);
  if(typeof value==='boolean'||!Number.isSafeInteger(id)||id<=0)continue;
  destinations.set(id,[...(destinations.get(id)||[]),label]);
 }
 if(!destinations.size)return null;
 const chat=String(Math.abs(Number(chatId))).slice(3);
 return <div className="space-y-1 text-sm" aria-label="Topic routes"><p className="font-medium">Topics</p>
  <ul className="flex flex-wrap gap-x-4 gap-y-1">{[...destinations].map(([id,names])=><li key={id}>
   <a className="underline" href={`https://t.me/c/${chat}/${id}`} target="_blank" rel="noreferrer">{names.join(' / ')}</a>
  </li>)}</ul>
 </div>;
}
