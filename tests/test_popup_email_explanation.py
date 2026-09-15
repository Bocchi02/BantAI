"""Exercise popup explanation behavior with synthetic cloud results in Node."""

from pathlib import Path
import shutil
import subprocess
import unittest


class PopupEmailExplanationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node is required for popup logic")
    def test_sender_context_is_visible_without_overriding_final_warning(self):
        root = Path(__file__).resolve().parents[1]
        script = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/popup/popup.js', 'utf8');
const start = source.indexOf('function simpleEmailMessage(');
const end = source.indexOf('function renderServer(', start);
const context = {indicatorLabels: () => []};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const review = {
  status: 'NO_STRONG_WARNING_SIGNS',
  body_context_sent_to_provider: true,
  sender_context_sent_to_provider: true,
  subject_context_sent_to_provider: true,
  reasoning_summary: 'The sender domain example.test matches the organization and routine notice. No unusual request was found.',
  recommended_action: 'Stay alert.'
};
const explain = (result, changes = {}) => context.simpleEmailMessage(
  {llm_review: {...review, ...changes}}, result
);
for (const result of ['SAFE', 'NO_STRONG_WARNING_SIGNS']) {
  const message = explain(result);
  assert.match(message, /sender domain example\.test matches/);
  assert.match(message, /This does not guarantee/);
  assert.doesNotMatch(message, /No unusual request/);
}
for (const result of ['NEEDS_CAUTION', 'SUSPICIOUS_SIGNS_FOUND']) {
  assert.doesNotMatch(explain(result), /matches the organization/);
}
assert.doesNotMatch(explain('NO_STRONG_WARNING_SIGNS', {status: 'UNAVAILABLE'}), /matches the organization/);
assert.doesNotMatch(explain('NO_STRONG_WARNING_SIGNS', {sender_context_sent_to_provider: false}), /matches the organization/);
assert.match(explain('CHECKING'), /Please wait/);
const disagreement = context.simpleEmailMessage({
  llm_review: review,
  email_detector: {result: {signal: 'SUSPICIOUS'}}
}, 'NEEDS_CAUTION');
assert.match(disagreement, /sender domain example\.test matches/);
assert.match(disagreement, /Other checks still raised a warning/);
assert.match(disagreement, /verify through the official app/);
"""
        completed = subprocess.run(
            [shutil.which("node"), "-e", script], cwd=root,
            capture_output=True, text=True,
        )
        self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr)
