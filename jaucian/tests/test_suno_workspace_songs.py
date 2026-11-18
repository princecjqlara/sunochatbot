import datetime as dt
import os
import unittest
import uuid
from unittest.mock import patch
import suno_workspace_songs as songs
from suno_profile import valid_workspace_link, workspace_origin

class SunoSongTests(unittest.TestCase):
    def setUp(self):
        self.now=dt.datetime.now(dt.timezone.utc)
        self.env={'SUNO_SYSTEM_ENABLED':'true','VEO_WORKSPACE_ENABLED':'true','VEO_WORKSPACE_URL':'https://suno.example','VEO_WORKSPACE_TENANT_ID':str(uuid.uuid4())}
        self.update={'update_id':1,'message':{'chat':{'id':-123},'from':{'id':42,'is_bot':False},'date':int(self.now.timestamp()),'text':'SONG SENT '+str(uuid.uuid4())}}

    def test_work_is_saved_once_by_update_reference_and_replies_use_the_scheduled_outbox(self):
        def saved(action,user,chat,data): return {'request_id':data['request_id']}
        with patch.dict(os.environ,self.env,clear=True),patch('veo_directory.verify_identity'),patch.object(songs,'call',side_effect=saved) as source,patch.object(songs,'enqueue_scheduled_action') as enqueue:
            self.assertTrue(songs.handle(self.update,{-123},self.now))
            self.assertTrue(songs.handle(self.update,{-123},self.now))
            self.assertEqual(source.call_args_list[0],source.call_args_list[1])
            self.assertEqual(enqueue.call_args_list[0].kwargs['dedupe_key'],enqueue.call_args_list[1].kwargs['dedupe_key'])
            self.assertTrue(songs.song_action({'payload':enqueue.call_args.kwargs['payload']}))

    def test_unapproved_stale_forwarded_and_bot_messages_cannot_change_work(self):
        with patch.dict(os.environ,self.env,clear=True),patch.object(songs,'call') as source:
            self.assertFalse(songs.handle(self.update,set(),self.now))
            for mutation in [{'date':int(self.now.timestamp())-601},{'forward_origin':{'type':'user'}},{'from':{'id':42,'is_bot':True}}]:
                changed={**self.update,'message':{**self.update['message'],**mutation}}
                self.assertFalse(songs.handle(changed,{-123},self.now))
            source.assert_not_called()

    def test_links_use_only_the_configured_suno_origin(self):
        with patch.dict(os.environ,self.env,clear=True):
            self.assertEqual(workspace_origin(),'https://suno.example')
            self.assertTrue(valid_workspace_link('https://suno.example/dashboard/workspace?view=work'))
            for link in ['https://veochatbot.vercel.app/dashboard/workspace','https://suno.example.evil/dashboard/x','https://suno.example/api/auth']:
                self.assertFalse(valid_workspace_link(link))
        with patch.dict(os.environ,{**self.env,'VEO_WORKSPACE_URL':'https://veochatbot.vercel.app'},clear=True):
            self.assertRaises(ValueError,workspace_origin)
