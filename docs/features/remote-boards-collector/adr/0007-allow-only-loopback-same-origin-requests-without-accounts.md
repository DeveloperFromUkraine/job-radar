---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "roadmap step 2 — remote-boards-collector"
---

# 0007 — Allow only loopback, same-origin requests, without accounts

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

In v1 the whole app must be reachable only on the owner's own machine; any other device, the owner's phone included, cannot connect at all (AC-17, spec §6.1). Binding to `127.0.0.1` stops other devices, but two paths remain through the owner's own browser: DNS rebinding (a hostile site points its domain at `127.0.0.1` and reads the API) and cross-site request forgery (a hostile page sends a request to `localhost` that starts a collection). The `HOST` environment variable could also be set to `0.0.0.0` by mistake. The rule applies to every route of every module, now and later.

## Decision drivers

- A visitor cannot connect at all (AC-17, spec §6.1 abuse case "visitor on the same network").
- Repeated collect-now presses must not exceed a source's rate (spec §6.1) — a forged request is one more press.
- No accounts in v1 (spec §6.1 AuthZ/AuthN impact); the owner should not have to log in to their own laptop app.
- Security review required (spec §6.1).

## Considered options

1. **Loopback + Host check + same-origin for state changes** — refuse to start on a non-loopback host; reject requests whose `Host` is not `127.0.0.1` / `localhost` on the configured port; require a JSON body on state-changing requests and reject `Sec-Fetch-Site: cross-site`; emit no CORS headers.
2. **Option 1 + a local secret token** — the server writes a random token to a file and every API request must carry it.
3. **Loopback binding only.**

## Decision outcome

**Chosen:** Option 1. Loopback binding meets AC-17 for other devices; the Host allowlist defeats DNS rebinding; requiring a JSON body forces a CORS preflight (a check browsers make before cross-site requests) that the server never approves, and `Sec-Fetch-Site` rejects the rest — together they defeat cross-site forgery without any login. Option 3 leaves both browser paths open; option 2 guards against other local processes, a threat outside the spec, at the cost of delivering a token to the SPA.

## Consequences

**Positive**
- Implemented once in `core/` as a Fastify hook; every later module inherits it.
- Nothing for the owner to configure or type.

**Negative**
- Opening the app from the phone or an always-on host later needs real authentication — the decision spec §3 already defers.

**Neutral**
- Tests must send a valid `Host` header (Fastify's `inject` defaults to `localhost:80`, so tests configure the port accordingly).

## Links

- Spec: [[../spec.md]] AC-17, §3, §6.1
- SAD: [[../sad.md]] §7, §8
- Related ADR: [[0001-ship-collector-as-server-module-plus-web-source-health]]
