from pathlib import Path

def edit(path, pairs):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new in pairs:
        if old not in s:
            continue
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')

for kind in ['Url', 'Email']:
    path=f'web/app/views/{kind}ReportsView.jsx'
    edit(path, [('observed_outcome','detector_outcome'), ('report.created_at','report.submitted_at'), ('report.classification','report.user_classification'), ('report.reason','report.feedback_reason')])
edit('web/app/views/UrlReportsView.jsx', [('                    confirmed: true,\n',''), ('Only addresses you submit are collected in full', 'Routine history keeps only website origins'), ('Routine website history stores origins only.', 'Full URLs can be collected through explicit reports or optional automatic contribution.')])
edit('web/app/views/EmailReportsView.jsx', [
 ('const [body, setBody] = useState("");','const [body, setBody] = useState("");\n    const [confirmed, setConfirmed] = useState(false);'),
 ('!body.trim() || body.length < 10','!body.trim() || !sender.trim() || !confirmed'),
 ('Paste at least 10 characters of the email body.', 'Enter a sender and email body, then confirm consent before submitting.'),
 ('sender: sender.trim() || undefined','sender: sender.trim()'),
 ('subject: subject.trim() || undefined','subject'), ('body: body.trim()','body'),
 ('setBody("");\n            setReason', 'setBody("");\n            setConfirmed(false);\n            setReason'),
 ('<button type="submit"', '<label className="flex gap-3"><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/>I consent to sending this email content for encrypted storage and administrator training review.</label>\n            <button type="submit"'),
 ('value={sender}', 'required value={sender}'),
 ('body.length < 10','!body.trim() || !confirmed'),
 ])
for kind in ['Url','Email']:
    edit(f'web/app/views/Admin{kind}ReportsView.jsx', [
     ('/${reportId}/review','/${reportId}'), ('method: "POST"','method: "PATCH"'),
     ('training_status: status,','action: { APPROVED: "APPROVE", REJECTED: "REJECT", INCONCLUSIVE: "INCONCLUSIVE" }[status],'),
     ('approved_label: label || undefined,','assessment: label || undefined,'),
     ('admin_notes: adminNotes[reportId]?.trim() || undefined,','reason: adminNotes[reportId]?.trim() || undefined,'),
     ('report.observed_outcome','report.detector_outcome'), ('report.created_at','report.submitted_at'),
     ('report.classification','report.user_classification'), ('report.reason','report.feedback_reason'),
    ])
edit('web/app/views/AdminUrlReportsView.jsx',[('report.verdict','report.feedback_verdict')])
edit('web/app/views/UsersView.jsx', [
 ('params.set("status", statusFilter)', 'params.set("account_status", statusFilter)'),
 ('`/admin/users/${user.id}/status`','`/admin/users/${user.id}/status?account_status=${nextStatus}`'),
 ('method: "PUT",\n                body: JSON.stringify({ status: nextStatus }),','method: "PATCH",'),
 ])
edit('web/app/components/ViewShared.jsx', [
 ('short: "No warning signs"','short: "No strong warning signs"'),
 ('|| OUTCOMES[1]', '|| { label: "Result unavailable", short: "Unavailable" }'),
 ('function StatusBadge({ outcome }) {','function StatusBadge({ outcome }) {\n    if (!OUTCOMES.some((item) => item.value === outcome)) return <span>Result unavailable</span>;'),
 ])
