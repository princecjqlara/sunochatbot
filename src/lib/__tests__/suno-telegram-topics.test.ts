import {expect,it} from 'vitest';
import {telegramGroupCatalog} from '../veo-telegram-groups';

it('keeps all Suno operational destinations when refreshing the approved Telegram directory',()=>{
 const topics={general:1,announcements:16,active:7581,clients:7673,receipts:4,close:4,done:4,songs:7692};
 const [group]=telegramGroupCatalog([{chat_id:-1002894511895,name:'Trabawho?',topics}],[],new Set(['-1002894511895']));
 expect(group.topics).toEqual(topics);
});

it('discards unsupported destinations and invalid topic IDs without admitting another group',()=>{
 const groups=telegramGroupCatalog([{chat_id:-1002894511895,topics:{songs:true,receipts:-1,active:0,unsupported:50,clients:13}},
 {chat_id:-1004498344479,topics:{songs:133}}],[],new Set(['-1002894511895']));
 expect(groups).toHaveLength(1);
 expect(groups[0].topics).toEqual({clients:13});
});
