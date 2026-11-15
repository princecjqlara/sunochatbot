"""Deployment boundaries must hold before any archive or Telegram work starts."""
import os
import unittest
from unittest.mock import patch

import database_scheduler
from configure_cronjob import dispatch_job_payload
from test_wsgi import call_app


class SunoDeploymentTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {
            "SUNO_SYSTEM_ENABLED": "true", "SUNO_DEPLOYMENT_STAGE": "setup",
            "CRON_SECRET": "cron-test", "INSIGHTS_API_KEY": "archive-test",
            "VEO_JAUCIAN_SECRET": "handoff-test", "TELEGRAM_WEBHOOK_SECRET": "hook-test",
        }, clear=True)
        env.start()
        self.addCleanup(env.stop)

    def test_setup_health_is_unhealthy_without_database_or_scheduler_calls(self):
        with patch("app.archive_status") as archive, patch("database_scheduler.scheduler_status") as scheduler:
            status, body = call_app("/api/health")
        self.assertEqual((status, body), (503, {"ok": False, "reason": "suno_setup_pending"}))
        archive.assert_not_called()
        scheduler.assert_not_called()

    def test_setup_blocks_every_write_and_worker_before_side_effects(self):
        cases = [
            ("/api/cron/dispatch", "GET", {"Authorization": "Bearer cron-test"}),
            ("/api/cron/dispatch", "GET", {"Authorization": "Bearer archive-test"}),
            ("/api/webhook", "POST", {"X-Telegram-Bot-Api-Secret-Token": "hook-test"}),
            ("/api/veo/handoff", "POST", {"Authorization": "Bearer handoff-test"}),
            ("/api/veo/workspace", "GET", {"Authorization": "Bearer handoff-test"}),
            ("/api/scheduler", "POST", {"Authorization": "Bearer archive-test"}),
            ("/api/schedules", "POST", {"Authorization": "Bearer archive-test"}),
            ("/api/reports/surveys", "POST", {"Authorization": "Bearer archive-test"}),
        ]
        with patch("app.dispatch_route") as dispatch, patch("app.webhook_route") as webhook, \
                patch("app.scheduler_route") as scheduler, patch("app.schedules_route") as schedules, \
                patch("veo_workspace.receive") as handoff:
            for path, method, headers in cases:
                with self.subTest(path=path, headers=list(headers)):
                    status, body = call_app(path, method=method, headers=headers)
                    self.assertEqual(status, 503)
                    self.assertEqual(body["reason"], "suno_setup_pending")
        for handler in (dispatch, webhook, scheduler, schedules, handoff):
            handler.assert_not_called()

    def test_setup_requires_authentication_even_when_workers_are_paused(self):
        for path in ("/api/cron/dispatch", "/api/veo/handoff", "/api/veo/workspace", "/api/webhook", "/api/scheduler"):
            for headers in ({}, {"Authorization": "Bearer wrong"}, {"X-Middleware-Subrequest": "middleware:middleware"}):
                with self.subTest(path=path, headers=headers):
                    status, _ = call_app(path, headers=headers)
                    self.assertEqual(status, 401)

    def test_authenticated_archive_reads_remain_available_during_setup(self):
        with patch("app.archive_status", return_value=[]), patch("app.automation_controls.status", return_value={}), \
                patch("app.known_chats", return_value=[]):
            for path in ("/api/status", "/api/groups"):
                self.assertEqual(call_app(path, headers={})[0], 401)
                status, body = call_app(path, headers={"Authorization": "Bearer archive-test"})
                self.assertEqual(status, 200)
                self.assertTrue(body["ok"])
                if path == "/api/status":
                    self.assertEqual(body["deployment_stage"], "setup")
                    self.assertTrue(body["automation_paused"])

    def test_missing_and_misspelled_stage_cannot_activate_the_bot(self):
        for stage in ("", "actve", "production"):
            with self.subTest(stage=stage), patch.dict(os.environ, {"SUNO_DEPLOYMENT_STAGE": stage}):
                self.assertEqual(call_app("/api/health")[1]["reason"], "suno_setup_pending")
                self.assertEqual(call_app("/api/cron/dispatch", headers={"Authorization": "Bearer cron-test"})[0], 503)

    def test_active_suno_health_requires_a_scheduler_connection(self):
        with patch.dict(os.environ, {"SUNO_DEPLOYMENT_STAGE": "active"}), patch("app.archive_status") as archive:
            self.assertEqual(call_app("/api/health"), (503, {"ok": False, "reason": "scheduler_not_configured"}))
        archive.assert_not_called()

    def test_active_dispatch_rejects_missing_wrong_and_unconfigured_authentication(self):
        with patch.dict(os.environ, {"SUNO_DEPLOYMENT_STAGE": "active"}), patch("app.deliver_due_actions") as delivery:
            for headers in ({}, {"Authorization": "Bearer wrong"}, {"X-Middleware-Subrequest": "middleware"}):
                self.assertEqual(call_app("/api/cron/dispatch", headers=headers)[0], 401)
            with patch.dict(os.environ, {"CRON_SECRET": "", "INSIGHTS_API_KEY": ""}):
                self.assertEqual(call_app("/api/cron/dispatch", headers={"Authorization": "Bearer "})[0], 401)
        delivery.assert_not_called()

    def test_external_scheduler_cannot_be_configured_without_authentication(self):
        with self.assertRaises(ValueError):
            dispatch_job_payload("https://suno.example", "")
        with patch.dict(os.environ, {"CRON_SECRET": "", "INSIGHTS_API_KEY": ""}):
            with self.assertRaisesRegex(database_scheduler.SchedulerError, "dispatcher_authentication_not_configured"):
                database_scheduler._dispatch_command(None)

    def test_database_scheduler_embeds_auth_without_network_or_delivery(self):
        command = database_scheduler._dispatch_command(None)
        self.assertIn('"Authorization": "Bearer cron-test"', command)
        self.assertIn("headers :=", command)
        self.assertNotIn("archive-test", command)

    def test_setup_does_not_change_the_upstream_non_suno_health_contract(self):
        with patch.dict(os.environ, {"SUNO_SYSTEM_ENABLED": "false"}), patch("app.archive_status", return_value=[]):
            self.assertEqual(call_app("/api/health"), (200, {"ok": True}))
