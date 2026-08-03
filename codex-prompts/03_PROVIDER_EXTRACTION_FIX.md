Read the repository instructions and inspect only the affected provider
extractor plus the service-worker message flow.

Fix the reproducible extraction issue with the smallest possible change.

Requirements:
- preserve Gmail, Outlook, and Yahoo behavior outside the affected case;
- do not add embedded-link extraction;
- do not store email bodies;
- do not change model thresholds;
- keep automatic refresh and stale-result protection;
- add comments only where they explain a non-obvious selector or safeguard.

Run all static checks and report what still requires manual browser testing.
