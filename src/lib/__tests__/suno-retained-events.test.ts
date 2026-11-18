import { expect,it } from 'vitest';
import { retainedEventObservations } from '../suno-retained-events';
it('keeps provider identity and source time stable across webhook retries without inventing event dates',()=>{
 const payload={object:'page',entry:[{id:'123',messaging:[{timestamp:1700000000000,sender:{id:'customer'},message:{mid:'provider-message',text:'Customer answer'}}],standby:[{message:{mid:'undated'}}]}]};
 const first=retainedEventObservations(payload),second=retainedEventObservations(payload);
 expect(first).toEqual(second);expect(first).toHaveLength(1);expect(first[0].event_key).toBe('123:messaging:provider-message');
 expect(first[0].occurred_at).toBe(new Date(1700000000000).toISOString());
 expect((first[0].payload as any).entry[0].messaging[0].message.text).toBe('Customer answer');
});
it('keeps oversized provider IDs within the durable key limit without conflating different events',()=>{
 const event=(mid:string)=>({object:'page',entry:[{id:'123',time:1700000000000,messaging:[{message:{mid}}]}]});
 const a=retainedEventObservations(event('a'.repeat(500)))[0],b=retainedEventObservations(event('b'.repeat(500)))[0];
 expect(a.event_key.length).toBeLessThanOrEqual(200);expect(a.event_key).not.toBe(b.event_key);
});
