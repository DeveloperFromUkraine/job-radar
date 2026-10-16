// CV text extraction on the owner's machine (ADR-0007): a PDF, a Word document (.docx) or plain text
// becomes plain text, or is refused with what is wrong and which kinds work (spec AC-08). The kind is
// read from the file's own signature, not trusted from the declared type. Nothing here is stored.
import { inflateRawSync } from "node:zlib";
import { extractText, getDocumentProxy } from "unpdf";

export const MAX_CV_BYTES = 5 * 1024 * 1024;
const MAX_DOCX_XML_BYTES = 20 * 1024 * 1024; // zip-bomb guard for the inflated document part

const WORKS = "Upload a PDF, a Word document (.docx) or a plain text file";

export type CvRefusalCode =
  | "MATCHING_CV_UNSUPPORTED"
  | "MATCHING_CV_NO_TEXT"
  | "MATCHING_CV_EMPTY"
  | "MATCHING_CV_TOO_LARGE";

export type CvText =
  | { ok: true; text: string }
  | { ok: false; code: CvRefusalCode; status: 400 | 413; message: string };

export const CV_REFUSALS: Record<CvRefusalCode, { status: 400 | 413; message: string }> = {
  MATCHING_CV_UNSUPPORTED: { status: 400, message: `This kind of file can't be read. ${WORKS}.` },
  MATCHING_CV_NO_TEXT: {
    status: 400,
    message: `This file has no text job-radar can read; it may be a scanned image. ${WORKS} with text in it.`,
  },
  MATCHING_CV_EMPTY: { status: 400, message: `This file is empty. ${WORKS}.` },
  MATCHING_CV_TOO_LARGE: { status: 413, message: `This file is larger than 5 MB. ${WORKS} of up to 5 MB.` },
};

const refuse = (code: CvRefusalCode): CvText => ({ ok: false, code, ...CV_REFUSALS[code] });

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);
const PDF_SIG = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04]; // PK\3\4

export async function extractCvText(file: { mediaType: string; bytes: Uint8Array }): Promise<CvText> {
  const { bytes } = file;
  if (bytes.length > MAX_CV_BYTES) return refuse("MATCHING_CV_TOO_LARGE");
  if (bytes.length === 0) return refuse("MATCHING_CV_EMPTY");

  let text: string | null;
  if (startsWith(bytes, PDF_SIG)) text = await pdfText(bytes);
  else if (startsWith(bytes, ZIP_SIG)) text = docxText(bytes);
  else text = plainText(bytes);

  if (text === null) return refuse("MATCHING_CV_UNSUPPORTED");
  const clean = text
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return clean ? { ok: true, text: clean } : refuse("MATCHING_CV_NO_TEXT");
}

/** null = not a readable PDF. An image-only PDF reads as "" (no text). */
async function pdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return null;
  }
}

/** UTF-8 text with no control bytes beyond tab and newlines; anything else is not a text CV. */
function plainText(bytes: Uint8Array): string | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: a binary file is told apart by its control bytes
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? null : text;
}

// ---- .docx: a zip with word/document.xml -------------------------------------------------------

function docxText(bytes: Uint8Array): string | null {
  const xml = zipEntry(bytes, "word/document.xml");
  if (xml === null) return null;
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>|<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Reads one entry through the zip's central directory; null when missing or unreadable. */
function zipEntry(bytes: Uint8Array, name: string): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: the last "PK\5\6" within the final 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  try {
    for (let n = 0; n < entries; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) return null;
      const method = view.getUint16(p + 10, true);
      const compressedSize = view.getUint32(p + 20, true);
      const nameLength = view.getUint16(p + 28, true);
      const extraLength = view.getUint16(p + 30, true);
      const commentLength = view.getUint16(p + 32, true);
      const localOffset = view.getUint32(p + 42, true);
      const entryName = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
      if (entryName === name) {
        const dataStart =
          localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
        const data = bytes.subarray(dataStart, dataStart + compressedSize);
        if (method === 0) return decoder.decode(data);
        if (method === 8)
          return decoder.decode(inflateRawSync(data, { maxOutputLength: MAX_DOCX_XML_BYTES }));
        return null;
      }
      p += 46 + nameLength + extraLength + commentLength;
    }
  } catch {
    return null;
  }
  return null;
}
