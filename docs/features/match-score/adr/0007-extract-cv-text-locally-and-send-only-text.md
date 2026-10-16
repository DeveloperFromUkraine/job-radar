---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-15"
feature_size: "M"
ticket: "roadmap step 4"
---

# 0007 — Extract CV text locally and send only text

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

The owner uploads a CV as PDF, Word (DOCX) or plain text, up to 5 MB (spec AC-07, AC-08). An image-only scan, an empty or unsupported file must be refused with nothing sent off the machine (AC-08); contact details must never reach a scoring (AC-09). The provider reads PDFs natively but not Word files. No PDF or Word reader is installed.

## Decision drivers

- Spec AC-08: refuse unreadable files locally, nothing sent, nothing charged.
- Spec AC-09, §6.1: remove contact details; send as little personal data as possible.
- Spec §6 Draft profile time: ≤ 60 s p95.

## Considered options

1. **Extract text locally** for PDF and DOCX with two small libraries (picked in `tasks`), remove contact-looking text, and send only the remaining text.
2. **Send the PDF to the provider as a document;** read only DOCX locally.

## Decision outcome

**Chosen:** Option 1. Only local extraction can tell an image-only scan from a text PDF before anything leaves the machine, and only local text can be cleaned of emails, phone numbers and links before it is sent. Text is also fewer tokens than a PDF with page images. The CV file and its text are discarded after the draft is made.

## Consequences

**Positive**
- AC-08 and AC-09 hold before any network call.
- One drafting path for all three formats.

**Negative**
- Two new dependencies to vet and keep updated; layout cues (columns, tables) are lost in plain text.

**Neutral**
- Names are not detected locally; the drafting prompt and the profile's fixed shape keep them out (spec AC-09, AC-16).

## Links

- Spec: [[../spec.md]] AC-07 – AC-09, AC-20, §6.1
- SAD: [[../sad.md]] §4, §6, §8
- Related ADR: [[0006-reserve-the-largest-possible-cost-before-each-attempt-and-settle-from-usage]]
