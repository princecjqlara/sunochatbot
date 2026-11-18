import os
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import report_topics
import suno_profile
import veo_directory
from test_wsgi import call_app

CHAT = -1002894511895
OTHER = -1004498344479
ENV = {"SUNO_SYSTEM_ENABLED": "true", "SUNO_DEPLOYMENT_STAGE": "active",
       "INSIGHTS_API_KEY": "topic-test", "ALLOWED_CHAT_IDS": f"{CHAT},{OTHER}"}


class SunoTopicTests(unittest.TestCase):
    def test_all_eight_operational_roles_keep_existing_shared_receipt_topics(self):
        for chat, config in suno_profile.workspace_groups().items():
            routes = suno_profile.topic_routes(config)
            self.assertEqual(set(routes), {"general", "announcements", "active", "clients", "receipts", "close", "done", "songs"})
            self.assertEqual(routes["receipts"], routes["close"])
            self.assertEqual(routes["close"], routes["done"])
            self.assertEqual(routes["clients"], config["contact_thread"])
            self.assertEqual(len(set(routes.values())), 6)

    def test_directory_exports_song_and_receipt_destinations_for_each_suno_group(self):
        with patch.dict(os.environ, ENV), patch.object(veo_directory, "GROUPS", suno_profile.workspace_groups()), patch.object(veo_directory, "request", return_value=[]):
            for chat, config in suno_profile.workspace_groups().items():
                self.assertEqual(veo_directory.group_directory(chat)["topics"], suno_profile.topic_routes(config))

    def test_invalid_topic_values_never_become_valid_destinations(self):
        self.assertEqual(suno_profile.topic_routes({"songs": True, "active": 0, "receipts": -4}), {})

    def test_song_replies_use_each_groups_song_topic_unless_the_team_has_an_explicit_override(self):
        import suno_workspace_songs as songs
        tenant = "00000000-0000-4000-8000-000000000001"
        for chat, expected in [(CHAT, 7692), (OTHER, 133)]:
            for override in (None, 500):
                with self.subTest(chat=chat, override=override):
                    action = {"chat_id": chat, "payload": {"suno_song_request_id": "request", "veo_tenant_id": tenant, "suno_song_user_id": 42}}
                    with patch.dict(os.environ, {**ENV, "VEO_WORKSPACE_TENANT_ID": tenant}), \
                            patch("daily_automation.GROUPS", suno_profile.workspace_groups()), \
                            patch("veo_directory.teams", return_value={CHAT, OTHER}), \
                            patch("veo_directory.verify_identity"), \
                            patch.object(songs, "call", return_value={"text": "Song confirmation", "thread_id": override}), \
                            patch("telegram_sender.telegram_call", return_value={"message_id": 99}) as send:
                        songs.send(action)
                    self.assertEqual(send.call_args.args[0], "sendMessage")
                    self.assertEqual(send.call_args.args[1]["message_thread_id"], override or expected)

    def test_authenticated_suno_inventory_works_without_the_veo_reports_recipient(self):
        with patch.dict(os.environ, ENV), patch.object(report_topics, "request", return_value=[]) as read, patch("telegram_sender.telegram_call") as telegram:
            status, body = call_app("/api/reports/topics", headers={"Authorization": "Bearer topic-test"})
        self.assertEqual(status, 200)
        self.assertTrue(body["read_only"])
        self.assertEqual({row["chat_id"] for row in body["topics"]}, {CHAT, OTHER})
        self.assertEqual(len(body["topics"]), 12)
        self.assertTrue(all(row["name"] is None for row in body["topics"]))
        query = parse_qs(urlsplit("https://archive/" + read.call_args.args[0]).query)
        self.assertEqual(query["chat_id"], [f"in.({OTHER},{CHAT})"])
        self.assertEqual(len(read.call_args.args), 1)
        telegram.assert_not_called()

    def test_names_require_archived_evidence_from_the_same_approved_group(self):
        rows = [{"chat_id": CHAT, "payload": {"thread_id": 7692, "name": "Songs"}, "updated_at": "new"},
                {"chat_id": CHAT, "payload": {"thread_id": 7692, "name": "Older"}, "updated_at": "old"},
                {"chat_id": OTHER, "payload": {"thread_id": 7692, "name": "Another group"}}]
        with patch.object(report_topics, "request", return_value=rows):
            result = report_topics.suno_topics({CHAT})
        self.assertEqual({row["chat_id"] for row in result}, {CHAT})
        songs = next(row for row in result if row["thread_id"] == 7692)
        self.assertEqual((songs["name"], songs["name_observed_at"]), ("Songs", "new"))
        with patch.object(report_topics, "request") as read:
            self.assertEqual(report_topics.suno_topics({-100111}), [])
        read.assert_not_called()

    def test_anonymous_requests_and_archive_outages_cannot_expose_topics(self):
        with patch.dict(os.environ, ENV), patch.object(report_topics, "request") as read:
            self.assertEqual(call_app("/api/reports/topics", headers={})[0], 401)
        read.assert_not_called()
        with patch.dict(os.environ, ENV), patch.object(report_topics, "request", side_effect=RuntimeError("private token")):
            status, body = call_app("/api/reports/topics", headers={"Authorization": "Bearer topic-test"})
        self.assertEqual((status, body), (503, {"ok": False}))
