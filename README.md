# Double AIgents DSAR MCP server

A public, read-only [MCP](https://modelcontextprotocol.io) server for GDPR subject access requests (DSARs) and personal data breaches, for the UK, the EU and Switzerland.

**Endpoint (Streamable HTTP, no auth, no key):** `https://www.doubleaigents.com/api/mcp`
**Official MCP registry:** `com.doubleaigents.www/dsar`

## Tools

| Tool | What it does |
|---|---|
| `dsar_deadline` | Due date for a subject access request (UK GDPR Art 12A, EU GDPR Art 12(3), Swiss revFADP), with extension rules |
| `breach_clock` | 72-hour breach notification deadline (UK/EU Art 33), to the hour; Swiss rule |
| `dsar_letter_template` | Acknowledgement, extension and clarification letters, UK/EU/CH wording |
| `dsar_quote` | Fixed price for an outsourced DSAR by page count (GBP/EUR/CHF) |
| `dsar_service_info` | What the Double AIgents DSAR service covers |
| `dsar_request_scoping` | How to start a request (returns a mailto link; stores nothing) |

General information, not legal advice. The controller decides.

## Use it

Claude Code:

```bash
claude mcp add --transport http doubleaigents-dsar https://www.doubleaigents.com/api/mcp
```

Any MCP client that supports Streamable HTTP: point it at the endpoint above.

## Privacy

Stateless. No storage, no accounts. Usage is counted as one log line per call (time, method, tool name, success); no arguments, IP addresses or user agents are logged.

## Code

`api/mcp.ts` is the Vercel serverless function that serves the endpoint, mirrored from our site. No dependencies.

## About

[Double AIgents Ltd](https://www.doubleaigents.com), registered in England and Wales, company no. 17513072, ICO registration ZC272947. Contact: james@doubleaigents.com.

MIT licence.
