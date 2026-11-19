import {uuid} from './veo-workspace';
export function sunoSongWorkAction(body:any){
 if(!body||!uuid(body.request_id)||!uuid(body.sale_id)||!Number.isSafeInteger(body.expected_version)||body.expected_version<1||
  !['working','revision','sent'].includes(body.status)||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.trim().length>500||body.assignee_id!=null&&!uuid(body.assignee_id))throw Error('Choose a song, current version, work status and a reason of 3 to 500 characters.');
 return {request_id:body.request_id,sale_id:body.sale_id,expected_version:body.expected_version,status:body.status,reason:body.reason.trim(),...(body.assignee_id?{assignee_id:body.assignee_id}:{})};
}
