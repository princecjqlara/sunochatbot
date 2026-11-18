import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import suno_profile


class SunoProfileTests(unittest.TestCase):
    def test_each_suno_team_can_deliver_and_register_availability_in_its_own_topic(self):
        import veo_shift_reports as shifts
        groups = suno_profile.workspace_groups()
        tomorrow = str(dt.datetime.now(shifts.MANILA).date() + dt.timedelta(days=1))
        for chat, topic in [(-1002894511895, 7581), (-1004498344479, 132)]:
            with self.subTest(chat=chat):
                action = {"chat_id": chat, "payload": {"veo_tenant_id": "tenant",
                    "veo_availability_date": tomorrow}}
                directory = {"teams": [{"telegram_groups_managed": True,
                    "telegram_groups": [{"chat_id": chat}]}]}
                with patch.object(shifts, "GROUPS", groups), \
                        patch("veo_directory.workspace_directory", return_value=directory), \
                        patch("veo_directory.teams", return_value={chat}), \
                        patch("telegram_sender.telegram_call", return_value={"message_id": 55, "poll": {"id": "poll"}}) as send, \
                        patch.object(shifts, "register_daily_poll", return_value=True) as register:
                    result = shifts.send_availability(action)
                    self.assertEqual(send.call_args.args[0], "sendPoll")
                    self.assertEqual(send.call_args.args[1]["chat_id"], chat)
                    self.assertEqual(send.call_args.args[1]["message_thread_id"], topic)
                    action["payload"].update(_veo_poll_id=result["poll"]["id"], _veo_message_id=result["message_id"])
                    shifts.register_availability(action)
                    self.assertEqual(register.call_args.kwargs["chat_id"], chat)
                    self.assertEqual(register.call_args.kwargs["thread_id"], topic)

    def test_crm_projects_cannot_be_used_as_the_new_bot_archive(self):
        with patch.dict(os.environ, {"SUNO_SYSTEM_ENABLED": "true"}):
            for project in suno_profile.BLOCKED_ARCHIVE_PROJECTS:
                with self.subTest(project=project), self.assertRaises(RuntimeError):
                    suno_profile.validate_archive(f"https://{project}.supabase.co")
            suno_profile.validate_archive("https://new-suno-archive.supabase.co")

    def test_archive_origin_rejects_credentials_paths_and_plain_http(self):
        with patch.dict(os.environ, {"SUNO_SYSTEM_ENABLED": "true"}):
            for url in ["http://archive.supabase.co", "https://user:pass@archive.supabase.co", "https://archive.supabase.co/path", "https://archive.supabase.co?other=1"]:
                with self.subTest(url=url), self.assertRaises(RuntimeError):
                    suno_profile.validate_archive(url)

    def test_dispatcher_cannot_target_the_original_veo_deployment(self):
        with patch.dict(os.environ, {"SUNO_JAUCIAN_URL": "https://jaucianassitant.vercel.app"}):
            with self.assertRaises(RuntimeError):
                suno_profile.dispatch_url()
        with patch.dict(os.environ, {"SUNO_JAUCIAN_URL": "https://my-suno-bot.example.com"}):
            self.assertEqual(suno_profile.dispatch_url(), "https://my-suno-bot.example.com/api/cron/dispatch")

    def test_suno_runtime_excludes_veo_and_inherited_report_recipient(self):
        env = {k: v for k, v in os.environ.items() if not k.startswith(("SUNO_", "VEO_"))}
        env["SUNO_SYSTEM_ENABLED"] = "true"
        result = subprocess.run([sys.executable, "-c",
            "import daily_automation as d,json; print(json.dumps({'groups':sorted(d.GROUPS),'legacy':sorted(d.SUNO_GROUPS),'reports':d.DAILY_REPORTS_CHAT_ID}))"],
            cwd=Path(__file__).resolve().parent.parent, env=env, capture_output=True, text=True, check=True)
        actual = json.loads(result.stdout)
        self.assertEqual(actual["groups"], [-1004498344479, -1002894511895])
        self.assertEqual(actual["legacy"], [-1002894511895])
        self.assertEqual(actual["reports"], 0)
