---
name: skill-creator
description: Create or update AgentSkills. Use when designing, structuring, or packaging skills with scripts, references, and assets.
---

# Skill Creator (Local Extensions)

This extends the built-in skill-creator with patterns specific to our workspace.

## References

- **[Browser-Auth-to-HTTP](references/browser-auth-to-http.md)** — Pattern for automating web services that lack public APIs. Use Playwright for auth, then drop to raw HTTP for speed. Covers login flows (email/password/OTP), CSRF handling, session caching in Valkey, and endpoint discovery. Reference implementation: `skills/calendly/`.

## Scripting Conventions

See `skills/scripting/SKILL.md` for Bun+TypeScript CLI patterns used across all skill scripts.
