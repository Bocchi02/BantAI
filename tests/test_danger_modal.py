"""Synthetic dangerous-result modal dispatch checks without browser access."""

import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which("node"), "Node required")
class DangerousModalTests(unittest.TestCase):
    def test_background_opens_only_final_current_dangerous_results_once(self) -> None:
        script = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/background/service-worker.js', 'utf8');
const tab = {id: 4, url: 'https://danger.example.test/path'};
const states = {'4': {
  current_url: tab.url, hostname: 'danger.example.test',
  url_detector: {
    activity_event_id: 'url-1', signal: 'SUSPICIOUS_SIGNS_FOUND',
    result: {final_result: 'SUSPICIOUS_SIGNS_FOUND', message: 'Check this address.'}
  }
}};
const installed = new Set();
const messages = [];
let injections = 0;
const context = {
  console, URL, dangerModalRequests: new Map(),
  canScanAddressBarUrl: () => true,
  hostnameForUrl: url => new URL(url).hostname,
  getTabStates: async () => states,
  patchTabState: async (id, update) => (states[String(id)] = update(states[String(id)])),
  chrome: {
    tabs: {
      get: async () => tab,
      sendMessage: async (id, message) => {
        if (!installed.has(id)) throw new Error('No modal script');
        messages.push(message);
        return {ok: true};
      }
    },
    scripting: {executeScript: async ({target, files}) => {
      assert.deepEqual(Array.from(files), ['content/analysis-modal.js']);
      injections++;
      installed.add(target.tabId);
    }}
  }
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function isDangerousOutcome('), source.indexOf('async function openFiveSecondPopup(')), context);

(async () => {
  assert.equal(await context.showDangerousResultModal(tab, states['4'], 'URL', 'url-1'), true);
  assert.equal(injections, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].data.websiteAnalysis.signal, 'SUSPICIOUS_SIGNS_FOUND');
  assert.equal(messages[0].data.emailAnalysis.signal, 'NOT DETECTED');
  assert.equal(states['4'].danger_modal_event_id, 'url-1');
  assert.equal(await context.showDangerousResultModal(tab, states['4'], 'URL', 'url-1'), true);
  assert.equal(messages.length, 1);

  // A stale URL or a safe final result must never create another overlay.
  tab.url = 'https://different.example.test/';
  assert.equal(await context.showDangerousResultModal(tab, states['4'], 'URL', 'url-1'), false);
  tab.url = 'https://danger.example.test/path';
  states['4'].url_detector.result.final_result = 'NO_STRONG_WARNING_SIGNS';
  states['4'].url_detector.signal = 'NO_STRONG_WARNING_SIGNS';
  assert.equal(await context.showDangerousResultModal(tab, states['4'], 'URL', 'url-safe'), false);

  // Email danger is dispatched with sender/subject, never an email body.
  tab.url = 'https://mail.google.com/mail/u/0/#inbox/synthetic';
  states['4'] = {
    current_url: tab.url, hostname: 'mail.google.com',
    hybrid_analysis_id: 'email-1',
    url_detector: {signal: 'NO_STRONG_WARNING_SIGNS', result: {final_result: 'NO_STRONG_WARNING_SIGNS'}},
    email_detector: {sender: 'notice@example.test', subject: 'Synthetic notice', body: 'PRIVATE_BODY'},
    fusion: {final_result: 'SUSPICIOUS_SIGNS_FOUND', message: 'Check the sender.'}
  };
  assert.equal(await context.showDangerousResultModal(tab, states['4'], 'EMAIL', 'email-1'), true);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].data.isEmail, true);
  assert.equal(messages[1].data.emailAnalysis.sender, 'notice@example.test');
  assert.ok(!JSON.stringify(messages[1]).includes('PRIVATE_BODY'));
})().catch(error => {console.error(error); process.exitCode = 1;});
"""
        result = subprocess.run(
            [shutil.which("node"), "-e", script],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_dangerous_modal_requires_an_explicit_choice_without_changing_styles(self) -> None:
        modal = (ROOT / "extension/content/analysis-modal.js").read_text(encoding="utf-8")
        popup = (ROOT / "extension/popup/popup.js").read_text(encoding="utf-8")
        manifest = json.loads((ROOT / "extension/manifest.json").read_text(encoding="utf-8"))

        self.assertIn("https://*/*", manifest["host_permissions"])
        self.assertNotIn("http://*/*", manifest["host_permissions"])
        self.assertIn('isDangerous ? goBack : closeModal', modal)
        self.assertIn('if (!isDangerous && e.target === backdrop)', modal)
        self.assertIn('if (isDangerous) e.stopImmediatePropagation()', modal)
        self.assertIn('backBtn?.focus()', modal)
        self.assertIn('window.location.replace("about:blank")', modal)
        self.assertNotIn('elements.viewDetailsBtn.click()', popup)
        self.assertIn(".signalam-modal.is-dangerous", modal)


if __name__ == "__main__":
    unittest.main()
