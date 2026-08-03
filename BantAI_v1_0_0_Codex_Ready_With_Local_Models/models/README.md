# Local frozen models

The trained models are stored inside this project folder for local development
and Codex app workflows.

Expected paths:

```text
models/
├── email_text_xlmr_v1/
│   └── checkpoint-15666/
│       ├── config.json
│       ├── model.safetensors
│       ├── tokenizer_config.json
│       └── tokenizer files
└── url_random_forest_v4b/
    └── bantai_rf_url_model_v4b_optimized.joblib
```

These files remain local and are ignored by Git. They should not be committed
to public repositories or shared unintentionally.

Run:

```powershell
python scripts\verify_models.py
```

to check that the expected runtime files are present.
