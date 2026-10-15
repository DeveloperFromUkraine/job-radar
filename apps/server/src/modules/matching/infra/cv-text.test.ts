import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractCvText, MAX_CV_BYTES } from "./cv-text.js";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../../../test/fixtures/cv/${name}`, import.meta.url)));

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TXT = "text/plain";
const WORKS = "Upload a PDF, a Word document (.docx) or a plain text file";

describe("extractCvText (ADR-0007, AC-08)", () => {
  it.each([
    ["a text PDF", "cv.pdf", PDF],
    ["a Word document", "cv.docx", DOCX],
    ["a plain text file", "cv.txt", TXT],
  ])("reads %s locally", async (_n, file, mediaType) => {
    const r = await extractCvText({ mediaType, bytes: fixture(file) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("Senior TypeScript engineer, 8 years");
      expect(r.text).toContain("Solutions Architect");
    }
  });

  it("reads a PDF by its signature even when declared as text", async () => {
    const r = await extractCvText({ mediaType: TXT, bytes: fixture("cv.pdf") });
    expect(r.ok && r.text.includes("TypeScript")).toBe(true);
  });

  it("refuses an image-only scan: no text", async () => {
    expect(await extractCvText({ mediaType: PDF, bytes: fixture("scan.pdf") })).toEqual({
      ok: false,
      code: "MATCHING_CV_NO_TEXT",
      status: 400,
      message: `This file has no text job-radar can read; it may be a scanned image. ${WORKS} with text in it.`,
    });
  });

  it("refuses an empty file", async () => {
    expect(await extractCvText({ mediaType: TXT, bytes: fixture("empty.txt") })).toEqual({
      ok: false,
      code: "MATCHING_CV_EMPTY",
      status: 400,
      message: `This file is empty. ${WORKS}.`,
    });
  });

  it.each([
    ["a picture", "photo.png", "image/png"],
    ["an old Word .doc", "doc", "application/msword"],
    ["a PDF lookalike with no structure", "fake.pdf", PDF],
  ])("refuses %s as unsupported", async (_n, file, mediaType) => {
    const bytes =
      file === "doc"
        ? new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0])
        : file === "fake.pdf"
          ? new TextEncoder().encode("%PDF-1.4 not really")
          : fixture(file);
    const r = await extractCvText({ mediaType, bytes });
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) {
      expect(["MATCHING_CV_UNSUPPORTED", "MATCHING_CV_NO_TEXT"]).toContain(r.code);
      expect(r.message).toContain(WORKS);
    }
  });

  it("refuses a file over 5 MB before reading it", async () => {
    const r = await extractCvText({ mediaType: TXT, bytes: new Uint8Array(MAX_CV_BYTES + 1).fill(65) });
    expect(r).toEqual({
      ok: false,
      code: "MATCHING_CV_TOO_LARGE",
      status: 413,
      message: `This file is larger than 5 MB. ${WORKS} of up to 5 MB.`,
    });
  });

  it("refuses text that is not UTF-8 text (binary content declared as text)", async () => {
    const r = await extractCvText({ mediaType: TXT, bytes: new Uint8Array([0, 1, 2, 0xff, 0xfe, 0]) });
    expect(r).toMatchObject({ ok: false, code: "MATCHING_CV_UNSUPPORTED" });
  });
});
