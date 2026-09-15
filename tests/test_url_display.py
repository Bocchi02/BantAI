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
assert.equal(decide({signal:'SUSPICIOUS', final_result:'SUSPICIOUS_SIGNS_FOUND', llm_review:{status:'UNAVAILABLE'}}), 'UNAVAILABLE');
assert.equal(decide({signal:'SUSPICIOUS', final_result:'NO_STRONG_WARNING_SIGNS', llm_review:{status:'NO_STRONG_WARNING_SIGNS'}}), 'NO_STRONG_WARNING_SIGNS');
assert.equal(decide({signal:'SUSPICIOUS', final_result:'SUSPICIOUS_SIGNS_FOUND', llm_review:{status:'SUSPICIOUS_SIGNS_FOUND'}}), 'SUSPICIOUS_SIGNS_FOUND');
assert.equal(decide({signal:'SAFE', final_result:'NO_STRONG_WARNING_SIGNS'}), 'NO_STRONG_WARNING_SIGNS');
assert.equal(decide({signal:'SAFE', final_result:'NO_STRONG_WARNING_SIGNS'}, 'analyzing'), 'CHECKING');
'''
        result = subprocess.run([shutil.which('node'), '-e', script], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
