# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| latest (`main`) | ✅ |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities. Instead,
report them privately:

- Email **edy.cu@live.com**, or
- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) (Security → Report a vulnerability).

You'll get an acknowledgment within 48 hours and a resolution timeline after
triage. Please give us a reasonable window to patch before public disclosure.

## Scope notes

- **Never commit private keys.** `OPS_WALLET_PK` and any wallet key belong only
  in `.env.local` (gitignored). The committed `.env.example` holds addresses and
  placeholders only.
- The real on-chain payout is gated behind `AGENTDUEL_ALLOW_PAYOUT=1` and a
  balance pre-flight; report any path that could move funds without both.
