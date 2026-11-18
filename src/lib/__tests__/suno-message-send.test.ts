import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('@/lib/facebook',()=>({sendMessage:m.send}));
import {sendSunoMessage} from '@/lib/suno-message-send';
const fixture=()=>{
    let reserved=false;
    const rpc=vi.fn(async(name:string)=>name==='reserve_chatbot_message'?{data:reserved?null:(reserved=true,'delivery'),error:null}:{data:null,error:null});
    const input={supabase:{rpc,from:vi.fn()},pageId:'page',contactId:'contact',message:'Hello',sourceKey:'inbound-one',args:['fb','token','person','Hello'] as any,checkDelivery:vi.fn(async()=>{})};
    return {input,rpc};
};
beforeEach(()=>{vi.clearAllMocks();});
it('never replays a timed-out send from a second worker',async()=>{
    const {input,rpc}=fixture();m.send.mockRejectedValue(new Error('Network timeout'));
    await expect(sendSunoMessage(input)).rejects.toThrow('Network timeout');
    await expect(sendSunoMessage(input)).rejects.toThrow('Duplicate chatbot message suppressed');
    expect(m.send).toHaveBeenCalledOnce();expect(rpc.mock.calls.some(([name])=>name==='finish_chatbot_message')).toBe(false);
});
it('retains the reservation after acknowledgment recording fails',async()=>{
    const {input,rpc}=fixture();m.send.mockResolvedValue({message_id:'accepted'});
    const original=rpc.getMockImplementation()!;
    rpc.mockImplementation(async(name:string)=>name==='finish_chatbot_message'?{data:null,error:{message:'offline'} as any}:original(name));
    await expect(sendSunoMessage(input)).rejects.toThrow('retain successful');
    await expect(sendSunoMessage(input)).rejects.toThrow('Duplicate');expect(m.send).toHaveBeenCalledOnce();
});
it('checks current eligibility before reserving and again before sending',async()=>{
    const {input,rpc}=fixture();input.checkDelivery.mockRejectedValueOnce(new Error('Human handover'));
    await expect(sendSunoMessage(input)).rejects.toThrow('Human handover');expect(rpc).not.toHaveBeenCalled();
    m.send.mockResolvedValue({message_id:'accepted'});await sendSunoMessage(input);
    expect(input.checkDelivery).toHaveBeenCalledTimes(3);expect(rpc).toHaveBeenLastCalledWith('finish_chatbot_message',{p_delivery_id:'delivery',p_message_id:'accepted'});
});
