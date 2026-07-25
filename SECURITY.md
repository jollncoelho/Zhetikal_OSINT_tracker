# Security Policy

## Supported Versions

We actively maintain and provide security updates for the following versions of **Ghostint Tracker**:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

We take the security and privacy of **Ghostint Tracker** very seriously, especially given its use in OSINT and Threat Intelligence investigations.

If you discover a security vulnerability, please **DO NOT** open a public issue. Instead, report it privately:

1. Send an email to the project maintainer with details about the vulnerability.
2. Include steps to reproduce the issue, proof-of-concept code, or screenshots if applicable.
3. Allow us reasonable time to investigate and address the vulnerability before public disclosure.

---

## OPSEC & Local Data Privacy

* **Local AI Processing:** Ghostint Tracker is designed with local-first features (e.g., Ollama / Gemma 2) to ensure data never leaves your environment unless explicitly configured (e.g., Hermes API key).
* **Credentials:** Always ensure you do not commit private API keys, environment files (`.env`), or target investigation logs to public forks or pull requests.

Thank you for helping keep Ghostint Tracker secure!
