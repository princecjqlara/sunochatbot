import {sqlIdentifier as q} from './database-migration-safety.mjs';
/** Retain owner settings even when an upstream migration changes its defaults. */
export async function saveSunoSettings(db) {
 await db.exec('CREATE TEMP TABLE suno_retained_chatbot_settings ON COMMIT DROP AS SELECT * FROM public.chatbot_configs');
}
export async function restoreSunoSettings(db, columns) {
 const names=columns.filter(c=>c.schema==='public'&&c.table_name==='chatbot_configs'&&!['id','page_id'].includes(c.name)).map(c=>c.name);
 // Updating a restored row must retain its original modification timestamp.
 // The transaction holds the table lock; business guards remain enabled.
 await db.exec('ALTER TABLE public.chatbot_configs DISABLE TRIGGER update_chatbot_configs_updated_at');
 await db.exec('UPDATE public.chatbot_configs live SET '+names.map(n=>q(n)+'=saved.'+q(n)).join(',')+' FROM suno_retained_chatbot_settings saved WHERE live.page_id=saved.page_id');
 await db.exec('ALTER TABLE public.chatbot_configs ENABLE TRIGGER update_chatbot_configs_updated_at');
}
