import subprocess
import shutil
import unittest
from pathlib import Path


class UrlDisplayTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node required')
    def test_only_completed_fusion_can_be_displayed(self):
        script = r'''
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/popup/popup.js', 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function websiteDecision('), source.indexOf('function renderWebsite(')), context);
const decide = (result, state = 'complete') => context.websiteDecision({state, result});
assert.equal(decide({signal:'SUSPICIOUS'}), 'CHECKING');
for (const status of ['OFF','CHECKING',undefined]) {
 assert.equal(decide({signal:'SUSPICIOUS', final_result:'SUSPICIOUS_SIGNS_FOUND', llm_review:{status}}), 'CHECKING');
}
// UNAVAILABLE is a terminal cloud-layer state. The manual popup keeps the
// deterministic local fallback while automatic popup gating remains disabled.
assert.equal(decide({signal:'SUSPICIOUS', final_result:'SUSPICIOUS_SIGNS_FOUND', llm_review:{status:'UNAVAILABLE'}}), 'SUSPICIOUS_SIGNS_FOUND');
assert.equal(decide({signal:'SUSPICIOUS', final_result:'NO_STRONG_WARNING_SIGNS', llm_review:{status:'NO_STRONG_WARNING_SIGNS'}}), 'NO_STRONG_WARNING_SIGNS');
assert.equal(decide({signal:'SUSPICIOUS', final_result:'SUSPICIOUS_SIGNS_FOUND', llm_review:{status:'SUSPICIOUS_SIGNS_FOUND'}}), 'SUSPICIOUS_SIGNS_FOUND');
assert.equal(decide({signal:'SAFE', final_result:'NO_STRONG_WARNING_SIGNS'}), 'NO_STRONG_WARNING_SIGNS');
assert.equal(decide({signal:'SAFE', final_result:'NO_STRONG_WARNING_SIGNS'}, 'analyzing'), 'CHECKING');
'''
        result = subprocess.run([shutil.which('node'), '-e', script], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    @unittest.skipUnless(shutil.which('node'), 'Node required')
    def test_same_tab_and_url_share_one_in_flight_request(self):
        script = r'''
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/background/service-worker.js', 'utf8');
let calls = 0;
let release;
const pending = new Promise(resolve => { release = resolve; });
const context = {
  urlAnalysisRequests: new Map(),
  performCurrentTabUrlScan: async () => { calls += 1; await pending; return 'done'; }
};
vm.createContext(context);
vm.runInContext(
  source.slice(source.indexOf('async function scanCurrentTabUrl('), source.indexOf('async function fetchHybridEmail(')),
  context
);
(async () => {
  const first = context.scanCurrentTabUrl({id: 7, url: 'https://example.test/path'}, {force: true});
  const second = context.scanCurrentTabUrl({id: 7, url: 'https://example.test/path'}, {force: true});
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), ['done', 'done']);
  assert.equal(context.urlAnalysisRequests.size, 0);
})().catch(error => { console.error(error); process.exitCode = 1; });
'''
        result = subprocess.run([shutil.which('node'), '-e', script], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
