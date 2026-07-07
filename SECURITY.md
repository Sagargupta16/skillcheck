# Security Policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Sagargupta16/skillcheck/security/advisories/new). Do not open a public issue for security problems.

Relevant surface: skillcheck reads and parses untrusted SKILL.md files and skillcheck.config.json. Malicious-input bugs (path traversal via skill names, ReDoS in rule regexes, workflow-command injection through finding messages in `--format github`) are in scope.
