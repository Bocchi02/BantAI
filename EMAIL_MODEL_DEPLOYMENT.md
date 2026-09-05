# Calibrated email model deployment

## Active artifact

- Model identifier: `full_taglish_xlmr_512_headtail_seed13`
- Runtime directory:
  `models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/`
- Runtime selection: `BANTAI_MODEL_DIR` points to that project-relative
  directory (or to the equivalent absolute path in a local `.env`).
- Labels verified from `config.json`: class 0 is `LEGITIMATE`; class 1 is
  `PHISHING_SOCIAL_ENGINEERING`.

The checkpoint files and `calibration.json` are copied without modification.
They remain ignored by Git and must not be committed or published.

## Exact preprocessing contract

Production inference uses the training implementation's
`subject_head_tail` behavior:

- maximum encoded length: 512 tokens, including required special tokens;
- input structure when a subject exists: `Subject: `, subject content,
  `\n\nBody: `, body content;
- subject structural budget: 96 tokens;
- subject tail fraction: 0.25;
- body tail fraction: 0.35;
- body cleaning: disabled;
- one tokenizer CLS/BOS token is retained at the beginning and one SEP/EOS
  token at the end;
- long subject and body segments retain both their head and tail;
- an assertion rejects any encoded result longer than 512 tokens.

This is implemented in `backend/email_model.py`. Ordinary tokenizer right
truncation is not used by the production email endpoint.

## Calibration and API meaning

For every inference, both raw class logits are divided by the temperature from
`calibration.json`, then softmax is applied. The class-1 output is compared with
the threshold from the same file:

```text
temperature = 2.2198894341340183
suspicious_probability = softmax(logits / temperature)[1]
suspicious_threshold = 0.6923658179915227
is_suspicious = suspicious_probability >= suspicious_threshold
```

The equivalent uncalibrated probability threshold, `0.858244001865387`, is a
diagnostic cross-check only. Production never compares an uncalibrated
probability with either decision threshold and never divides a probability by
the temperature.

`suspicious_probability` in `/analyze-email` and `/analyze-hybrid-email` is the
calibrated class-1 probability. `safe_probability` is the corresponding
calibrated class-0 probability. The response also exposes `predicted_label`,
`is_suspicious`, `model_version`, `calibration_method`, and `temperature` while
preserving the existing signal, probability, threshold, and token-count fields.

The evidence supporting this calibration is a retrospective test estimate. It
is not a new independent external validation. Revalidate the unchanged
artifact on a new, human-written English/Tagalog/Taglish email set before
making a confirmatory deployment claim.

## Rollback-only artifact

The prior checkpoint is retained at:

```text
models/email_text_xlmr_v1/rollback_archive/checkpoint-15666/
```

It is not referenced by production code, launchers, Docker configuration, or
environment templates. The current calibrated runtime must not be pointed at
that directory because the legacy checkpoint has a different preprocessing and
decision contract.

To perform an explicit rollback:

1. Stop the detector (`docker compose stop detector`, or stop the direct local
   launcher).
2. Restore the reviewed pre-calibration email integration source and deployment
   configuration from the release or source-control revision that used the
   legacy checkpoint. Do not mix the old checkpoint with
   `backend/email_model.py`.
3. Point `BANTAI_MODEL_DIR` in the restored deployment to
   `models/email_text_xlmr_v1/rollback_archive/checkpoint-15666`.
4. Run `python scripts\verify_models.py` from that restored release, then its
   full unit and syntax checks.
5. Start the detector and verify `/health` reports the legacy model contract
   before re-enabling the extension.

Rollback changes the model, 256-token right-truncation preprocessing, and
legacy decision threshold as one atomic release. Never combine only some of
those pieces.
