import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
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

/** A minimal zip: one entry, deflated, with its central directory (the reader ignores CRCs). */
function zip(name: string, content: Uint8Array): Uint8Array {
  const data = deflateRawSync(content);
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(n.length, 28);
  const cdStart = local.length + n.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + n.length, 12);
  end.writeUInt32LE(cdStart, 16);
  return new Uint8Array(Buffer.concat([local, n, data, central, n, end]));
}
const xml = (text: string) =>
  new TextEncoder().encode(
    `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );

describe("extractCvText on broken .docx files (AC-08, review R15)", () => {
  it("reads a well-formed one built the same way (the control)", async () => {
    const r = await extractCvText({
      mediaType: DOCX,
      bytes: zip("word/document.xml", xml("Senior TypeScript engineer")),
    });
    expect(r).toMatchObject({ ok: true });
  });

  it.each([
    ["a truncated zip", () => zip("word/document.xml", xml("Senior TypeScript engineer")).subarray(0, 40)],
    ["a zip with no word/document.xml", () => zip("word/other.xml", xml("Senior TypeScript engineer"))],
    [
      "a document part that inflates past the limit",
      () => zip("word/document.xml", new Uint8Array(25 * 1024 * 1024)),
    ],
  ])("refuses %s as unsupported, without throwing", async (_n, make) => {
    const bytes = make();
    expect(bytes.length).toBeLessThan(MAX_CV_BYTES);
    const r = await extractCvText({ mediaType: DOCX, bytes });
    expect(r).toMatchObject({ ok: false, status: 400, code: "MATCHING_CV_UNSUPPORTED" });
  });
});
