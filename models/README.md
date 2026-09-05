# Local frozen models

The trained models are stored inside this project folder for local development
and Codex app workflows.

Expected paths:

```text
models/
├── email_text_xlmr_v2/
│   └── full_taglish_xlmr_512_headtail_seed13/
│       ├── config.json
│       ├── calibration.json
│       ├── model.safetensors.index.json
│       ├── model-00001-of-00002.safetensors
│       ├── model-00002-of-00002.safetensors
│       ├── tokenizer_config.json
│       └── tokenizer files
├── email_text_xlmr_v1/
│   └── rollback_archive/
│       └── checkpoint-15666/              # rollback only
├── url_random_forest_grouped_v1/
│   └── bantai_rf_grouped_v1.0.0.joblib
└── url_random_forest_v4b/                  # deprecated rollback/audit only
    └── bantai_rf_url_model_v4b_optimized.joblib
```

These files remain local and are ignored by Git. They should not be committed
to public repositories or shared unintentionally.

The active URL artifact must have SHA-256
`4fd1417fbca11cc60a1eb1f16e9f71c1db0d76f6ce042feae5abcc2bde528c4c`.
The V4-B artifact is never selected automatically and is retained only for an
explicit manual rollback or audit.

The active email artifact is `full_taglish_xlmr_512_headtail_seed13`. It uses
temperature scaling (`2.2198894341340183`) and a calibrated class-1 suspicious
threshold of `0.6923658179915227`. The 512-token encoder preserves the subject
and the head and tail of long content. See `EMAIL_MODEL_DEPLOYMENT.md` for the
complete preprocessing contract and rollback steps.

Run:

```powershell
python scripts\verify_models.py
```

to check that the expected runtime files are present.
