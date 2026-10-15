import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { CvDraft, MatchingSettings } from "../api/matching";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

const SETTINGS = "GET /api/v1/matching/settings";
const DRAFT = "POST /api/v1/matching/cv-drafts";
const NOTICE = "POST /api/v1/matching/notice";
const SAVE = "POST /api/v1/matching/profile";
const withProfile = () => contractExample<MatchingSettings>("getMatchingSettings", 200, "with_profile");
const firstOpen = () => contractExample<MatchingSettings>("getMatchingSettings", 200, "first_open");
const draft = () => contractExample<CvDraft>("draftProfileFromCv", 200);
const err = (status: number, code: string, message: string) => ({
  status,
  body: { error: { code, message } },
});
const WORKS = "Upload a PDF, a Word document (.docx) or a plain text file";

const draftBodies = (fetchMock: ReturnType<typeof mockApi>["fetchMock"]) =>
  fetchMock.mock.calls
    .filter(([p]) => String(p) === "/api/v1/matching/cv-drafts")
    .map(([, i]) => JSON.parse(String(i?.body)));

const open = (overrides: Parameters<typeof mockApi>[0]) => {
  const api = mockApi(overrides);
  renderWithProviders(<App />, { route: "/profile" });
  return api;
};
async function choose(file: File) {
  const input = (await screen.findByLabelText("Upload your CV")) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}
const pdf = (bytes = 10) => new File([new Uint8Array(bytes).fill(37)], "cv.pdf", { type: "application/pdf" });

describe("SCR-03 CV upload and draft review", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("idle: a labelled 44 px upload with the kinds that work", async () => {
    open({ [SETTINGS]: { body: withProfile() } });
    const input = (await screen.findByLabelText("Upload your CV")) as HTMLInputElement;
    expect(input.accept).toBe(".pdf,.docx,.txt");
    expect(input.closest("label")?.className).toContain("min-h-11");
    expect(screen.getByText("PDF, Word (.docx) or text, up to 5 MB")).toBeTruthy();
  });

  it("refuses a file over 5 MB or of another kind in the browser: nothing sent (AC-08)", async () => {
    const { fetchMock } = open({ [SETTINGS]: { body: withProfile() } });
    await choose(pdf(5 * 1024 * 1024 + 1));
    expect(await screen.findByText(`This file is larger than 5 MB. ${WORKS} of up to 5 MB.`)).toBeTruthy();
    await choose(new File(["x"], "photo.png", { type: "image/png" }));
    expect(await screen.findByText(`This kind of file can't be read. ${WORKS}.`)).toBeTruthy();
    expect(draftBodies(fetchMock)).toHaveLength(0);
  });

  it("sends the file base64-encoded and shows the draft with its tags, not-mapped values and removed details (AC-07, AC-09)", async () => {
    const { fetchMock } = open({ [SETTINGS]: { body: withProfile() }, [DRAFT]: { body: draft() } });
    await choose(pdf(3));
    await screen.findByRole("heading", { name: "Draft from your CV" });
    expect(draftBodies(fetchMock)).toEqual([
      { file_name: "cv.pdf", media_type: "application/pdf", content_base64: btoa("%%%") },
    ]);
    expect(
      screen.getByText("Removed before anything was sent: your name, email, phone, 1 link."),
    ).toBeTruthy();
    // Each field carries its own tag (screens.md SCR-03 "draft ready", review R5).
    const near = (label: string) => within(screen.getByText(label).parentElement as HTMLElement);
    expect(near("Skills").getByText("from your CV")).toBeTruthy();
    expect(near("Minimum salary (gross)").getByText("not found in your CV")).toBeTruthy();
    expect(near("Years of experience").getByText(/from your CV|not found in your CV/)).toBeTruthy();
    expect(screen.getByText("Role types — not mapped: Solutions Architect")).toBeTruthy();
    expect(screen.getByLabelText("Skill 3")).toMatchObject({ value: "GraphQL" }); // correctable before use
  });

  it("shows the current profile beside the draft from md, collapsed on phones (review R5)", async () => {
    open({
      [SETTINGS]: { body: withProfile() },
      [DRAFT]: { body: { ...draft(), current: withProfile().profile } },
    });
    await choose(pdf());
    const details = (await screen.findByText("Show current profile")).closest("details");
    expect(details?.textContent).toContain("TypeScript (core)");
    expect(details?.className).toContain("md:hidden");
    const beside = screen.getByRole("complementary", { name: "Current profile" });
    expect(beside.closest("details")).toBeNull();
    expect(beside.textContent).toContain("TypeScript (core)");
    expect(beside.className).toContain("md:block");
    // On phones it sits below the draft's fields, above its buttons (wireframe 03-d, review R30).
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(screen.getByText("Engagement forms"), details as Node)).toBe(true);
    expect(follows(details as Node, screen.getByRole("button", { name: "Use this profile" }))).toBe(true);
    expect(beside.parentElement?.className).toContain("md:grid-cols-");
  });

  it("a first draft, with no current profile, takes the full width (review R29)", async () => {
    open({ [SETTINGS]: { body: { ...withProfile(), profile: null } }, [DRAFT]: { body: draft() } });
    await choose(pdf());
    await screen.findByRole("heading", { name: "Draft from your CV" });
    expect(screen.queryByText("Show current profile")).toBeNull();
    const form = screen.getByRole("button", { name: "Use this profile" }).closest("form");
    expect(form?.parentElement?.className).not.toContain("md:grid-cols-");
  });

  it("the data notice for a first upload shows under the upload, not at the end of the form (AC-20, review R17)", async () => {
    open({ [SETTINGS]: { body: firstOpen() } });
    await choose(pdf());
    const agree = await screen.findByRole("button", { name: "Agree and continue" });
    expect(agree.closest("form")).toBeNull();
    const upload = screen.getByLabelText("Upload your CV");
    expect(upload.compareDocumentPosition(agree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      agree.compareDocumentPosition(screen.getByLabelText("Skill 1")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("a CV draft refreshes Spent this month, since the draft was charged (AC-19, review R41)", async () => {
    open({
      [SETTINGS]: [{ body: withProfile() }, { body: { ...withProfile(), spent_usd_cents: 530 } }],
      [DRAFT]: { body: draft() },
    });
    expect(await screen.findByText("Spent this month: $4.98")).toBeTruthy();
    await choose(pdf());
    await screen.findByRole("heading", { name: "Draft from your CV" });
    expect(await screen.findByText("Spent this month: $5.30")).toBeTruthy();
  });

  it("Use this profile saves the (corrected) draft; Discard keeps the current profile", async () => {
    const { fetchMock } = open({
      [SETTINGS]: { body: withProfile() },
      [DRAFT]: { body: draft() },
      [SAVE]: { body: contractExample("saveProfile", 200, "unchanged") },
    });
    await choose(pdf());
    await screen.findByRole("heading", { name: "Draft from your CV" });
    fireEvent.change(screen.getByLabelText("Years of experience"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this profile" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls
          .filter(([p]) => String(p) === "/api/v1/matching/profile")
          .map(([, i]) => JSON.parse(String(i?.body)).profile.years),
      ).toEqual([9]),
    );
  });

  it("Discard drops the draft and returns to the current profile", async () => {
    open({ [SETTINGS]: { body: withProfile() }, [DRAFT]: { body: draft() } });
    await choose(pdf());
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(await screen.findByRole("heading", { name: "Your profile" })).toBeTruthy();
    expect(screen.getByLabelText("Skill 1")).toMatchObject({ value: "TypeScript" });
  });

  it("the first upload waits on the data notice; declining reads nothing (AC-20)", async () => {
    const { fetchMock } = open({
      [SETTINGS]: { body: firstOpen() },
      [NOTICE]: { body: { notice_agreed_at: "2026-10-15T09:00:00Z" } },
      [DRAFT]: { body: draft() },
    });
    await choose(pdf());
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(draftBodies(fetchMock)).toHaveLength(0);
    await choose(pdf());
    fireEvent.click(await screen.findByRole("button", { name: "Agree and continue" }));
    await screen.findByRole("heading", { name: "Draft from your CV" });
    expect(draftBodies(fetchMock)).toHaveLength(1);
  });

  it.each([
    [
      400,
      "MATCHING_CV_NO_TEXT",
      `This file has no text job-radar can read; it may be a scanned image. ${WORKS} with text in it.`,
    ],
    [413, "MATCHING_CV_TOO_LARGE", `This file is larger than 5 MB. ${WORKS} of up to 5 MB.`],
  ])(
    "unreadable (%d %s): the message under the button, profile unchanged (AC-08)",
    async (status, code, message) => {
      open({ [SETTINGS]: { body: withProfile() }, [DRAFT]: err(status, code, message) });
      await choose(pdf());
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByLabelText("Skill 1")).toMatchObject({ value: "TypeScript" });
    },
  );

  it("cap reached: the message and Change cap (AC-08)", async () => {
    const message =
      "This month's scoring cap is reached, so the draft can't be made. It can be made again from 1 November, or after you raise the cap.";
    open({ [SETTINGS]: { body: withProfile() }, [DRAFT]: err(409, "MATCHING_CAP_REACHED", message) });
    await choose(pdf());
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change cap" }).getAttribute("href")).toBe("#scoring-cap");
  });

  it("provider problem: the message, upload again later, the form still usable (AC-08)", async () => {
    const message =
      "The language-model provider can't be reached right now. Try again later; your profile is unchanged.";
    open({
      [SETTINGS]: { body: withProfile() },
      [DRAFT]: err(503, "MATCHING_PROVIDER_UNAVAILABLE", message),
    });
    await choose(pdf());
    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });
});
