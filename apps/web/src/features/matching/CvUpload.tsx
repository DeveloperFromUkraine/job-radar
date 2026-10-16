// screens.md SCR-03 NEW: CvUpload — a native file input behind a labelled 44 px button. Kind and size
// are checked in the browser before anything is sent (sad.md §8 CV upload transport, AC-08).
import { useId } from "react";

export const MAX_CV_BYTES = 5 * 1024 * 1024;
const WORKS = "Upload a PDF, a Word document (.docx) or a plain text file";
const KINDS: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export interface CvFile {
  file_name: string;
  media_type: string;
  content_base64: string;
}

/** The browser's check (AC-08); null when the file may be sent. The server checks again. */
export function refuseCv(file: File): string | null {
  if (file.size > MAX_CV_BYTES) return `This file is larger than 5 MB. ${WORKS} of up to 5 MB.`;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(ext in KINDS)) return `This kind of file can't be read. ${WORKS}.`;
  return null;
}

export function readCv(file: File): Promise<CvFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      resolve({
        file_name: file.name,
        media_type: file.type || (KINDS[ext] as string),
        content_base64: url.slice(url.indexOf(",") + 1),
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

export function CvUpload({
  onFile,
  pending = false,
  error,
}: {
  onFile: (file: File) => void;
  pending?: boolean;
  /** A refusal (browser or server) shown under the button. */
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label
        className={`inline-flex min-h-11 cursor-pointer items-center justify-center self-start rounded-card border border-border px-4 font-medium ${pending ? "opacity-60" : ""}`}
      >
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          disabled={pending}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          aria-invalid={error ? true : undefined}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // the same file can be chosen again
            if (file) onFile(file);
          }}
        />
        {pending ? "Reading your CV…" : "Upload your CV"}
      </label>
      <p id={`${id}-hint`} className="text-sm text-text-muted">
        PDF, Word (.docx) or text, up to 5 MB
      </p>
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
