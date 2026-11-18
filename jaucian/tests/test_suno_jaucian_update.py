"""Keep upstream intake repairs bound to the Suno bot and workspace."""
import datetime as dt
import io
import json
import os
import unittest
from unittest.mock import patch

import app
import veo_intake as intake
from daily_automation import GROUPS

CHAT = next(iter(GROUPS))
TENANT = '00000000-0000-4000-8000-000000000001'
REFERENCE = '00000000-0000-4000-8000-000000000002'


class SunoJaucianUpdateTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime.now(dt.timezone.utc)
        self.environment = {
            'SUNO_SYSTEM_ENABLED': 'true', 'SUNO_DEPLOYMENT_STAGE': 'active',
            'VEO_WORKSPACE_ENABLED': 'true', 'VEO_TELEGRAM_INTAKE_ENABLED': 'true',
            'VEO_WORKSPACE_TENANT_ID': TENANT, 'VEO_WORKSPACE_URL': 'https://suno.example',
            'VEO_JAUCIAN_SECRET': 'fixture-bridge-only',
        }
        state = patch.dict(os.environ, self.environment, clear=True)
        state.start()
        self.addCleanup(state.stop)

    def update(self, text):
        return {'update_id': 42, 'message': {'chat': {'id': CHAT}, 'date': int(self.now.timestamp()),
                'from': {'id': 42, 'is_bot': False}, 'text': text}}

    def test_suno_commands_accept_own_mentions_and_ignore_other_bots(self):
        result = {'request_id': REFERENCE, 'chat_id': CHAT, 'telegram_user_id': 42}
        with patch('automation_controls.new_clients_enabled', return_value=True), \
                patch('veo_directory.verify_identity'), patch.object(intake, 'call', return_value=result) as source, \
                patch.object(intake, 'enqueue_scheduled_action'):
            for text in ['/ready @dannysunobot', '/ready@Dannysunobot', '/busy@dannysunobot']:
                self.assertIn('Saved in Suno', intake.handle(self.update(text), {CHAT}, self.now))
            source.reset_mock()
            for text in ['/ready@Jaucianbot', '/busy @anotherbot', '/ready@dannysunobot extra']:
                self.assertIsNone(intake.handle(self.update(text), {CHAT}, self.now))
            source.assert_not_called()

    def test_suno_linking_guidance_keeps_the_correct_profile_name(self):
        with patch('automation_controls.new_clients_enabled', return_value=True), \
                patch('veo_directory.verify_identity', side_effect=ValueError('Link Telegram first')), \
                patch.object(intake, 'enqueue_scheduled_action') as enqueue:
            self.assertEqual(intake.handle(self.update('/ready'), {CHAT}, self.now), 'Link Telegram first')
        text = enqueue.call_args.kwargs['payload']['text']
        self.assertIn('Suno profile', text)
        self.assertNotIn('VEO profile', text)

    def test_suno_cannot_send_bridge_credentials_to_the_veo_workspace(self):
        with patch.dict(os.environ, {'VEO_WORKSPACE_URL': 'https://veochatbot.vercel.app'}), \
                patch.object(intake, 'open_request') as network:
            with self.assertRaises(ValueError):
                intake.call('pending', timeout=15)
        network.assert_not_called()

    def test_suno_pending_probe_keeps_the_configured_origin_and_full_timeout(self):
        result = {'ok': True, 'tenant_id': TENANT, 'offers': [], 'notices': []}
        with patch.object(intake, 'open_request') as network:
            network.return_value.__enter__.return_value = io.StringIO(json.dumps(result))
            self.assertEqual(intake.call('pending', timeout=15), result)
            self.assertEqual(network.call_args.args[0].full_url, 'https://suno.example/api/workspace/handoff')
            self.assertEqual(network.call_args.kwargs, {'timeout': 15})

    def test_setup_health_cannot_probe_assignments_or_touch_delivery(self):
        with patch.dict(os.environ, {'SUNO_DEPLOYMENT_STAGE': 'setup'}), \
                patch.object(intake, 'check_health') as probe, patch('app.deliver_due_actions') as deliver:
            statuses = []
            body = json.loads(b''.join(app.health_route({}, lambda status, headers: statuses.append(status))))
        self.assertTrue(statuses[0].startswith('503'))
        self.assertEqual(body['reason'], 'suno_setup_pending')
        probe.assert_not_called()
        deliver.assert_not_called()
