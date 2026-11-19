import {parseMoneyMinor} from './money-minor';
import {uuid} from './veo-workspace';
export {SUNO_SALES_POLICY} from './suno-sales-policy';
export function sunoSalesAction(body:any) {
    if (!body || !uuid(body.request_id) || !['sale','revision_fee','payment','refund'].includes(body.action)) throw Error('Choose a sales action and request ID');
    const amount_minor=parseMoneyMinor(body.amount);
    if (!Number.isSafeInteger(amount_minor) || amount_minor<=0 || amount_minor>9000000000000) throw Error('Enter a positive amount with at most two decimal places');
    const data:any={request_id:body.request_id,amount_minor};
    if(body.action==='sale') {
        if(![body.page_id,body.contact_id,body.payee_id].every(uuid) || typeof body.description!=='string' || !body.description.trim() || body.description.trim().length>500 || !/^[A-Z]{3}$/.test(body.currency)) throw Error('Choose a contact, assigned Makata, song description and currency');
        Object.assign(data,{page_id:body.page_id,contact_id:body.contact_id,payee_id:body.payee_id,description:body.description.trim(),currency:body.currency});
    } else {
        if(!uuid(body.sale_id)) throw Error('Choose a sale');data.sale_id=body.sale_id;
        if(body.action==='revision_fee') {
            if(typeof body.description!=='string' || !body.description.trim() || body.description.trim().length>500) throw Error('Describe the revision fee');data.description=body.description.trim();
        } else {
            if(body.confirmed!==true || typeof body.reference!=='string' || body.reference.trim().length<3 || body.reference.trim().length>160 || typeof body.occurred_at!=='string' || !Number.isFinite(Date.parse(body.occurred_at))) throw Error('Verify the payment and enter its receipt reference and actual time');
            Object.assign(data,{confirmed:true,reference:body.reference.trim(),occurred_at:new Date(body.occurred_at).toISOString()});
            if(body.action==='refund') {if(!uuid(body.payment_id))throw Error('Choose the original payment');data.payment_id=body.payment_id;}
            else {if(!['song','revision','tip'].includes(body.kind) || body.kind!=='tip' && !uuid(body.charge_id) || body.kind==='tip' && body.charge_id)throw Error('Choose a matching song, revision or tip payment');Object.assign(data,{kind:body.kind,charge_id:body.kind==='tip'?null:body.charge_id});}
        }
    }
    return {action:body.action,data};
}
export const sunoSalesDate=(v:string|null):v is string=>!!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
