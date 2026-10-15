// SCR-03 — the profile (screens.md): the editor or the CV draft review, the one-time data notice and
// the scoring cap.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../api/collector";
import {
  agreeNotice,
  type CvDraft,
  draftProfileFromCv,
  type Profile as ProfileData,
  saveProfile,
  setScoringCap,
} from "../api/matching";
import { InlineBanner } from "../components/InlineBanner";
import { SkeletonRow } from "../components/SkeletonRow";
import { CapField } from "../features/matching/CapField";
import { CvUpload, readCv, refuseCv } from "../features/matching/CvUpload";
import { DataNotice } from "../features/matching/DataNotice";
import { DraftReview } from "../features/matching/DraftReview";
import { ProfileForm } from "../features/matching/ProfileForm";
import { useMatchingSettings } from "../features/matching/queries";

const VALIDATION = new Set(["MATCHING_INVALID_PROFILE", "VALIDATION_ERROR"]);
const CV_REFUSALS = new Set([
  "MATCHING_CV_UNSUPPORTED",
  "MATCHING_CV_NO_TEXT",
  "MATCHING_CV_EMPTY",
  "MATCHING_CV_TOO_LARGE",
  "VALIDATION_ERROR",
]);
const NOT_AGREED = "MATCHING_NOTICE_NOT_AGREED";
const code = (err: unknown) => (err instanceof ApiError ? err.code : undefined);

/** An action waiting on the one-time notice (AC-20); nothing is sent or read while it waits. */
type Waiting = { kind: "profile"; profile: ProfileData } | { kind: "cv"; file: File } | null;

export function Profile() {
  const settings = useMatchingSettings();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [waiting, setWaiting] = useState<Waiting>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<CvDraft | null>(null);
  const [cvRefusal, setCvRefusal] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["matching"] });
      setDraft(null);
      if (result.changed) navigate("/");
      else setNotice("Nothing changed — your scores stay as they are.");
    },
    onError: (err, profile) => {
      if (code(err) === NOT_AGREED) setWaiting({ kind: "profile", profile });
    },
  });
  const cv = useMutation({
    mutationFn: async (file: File) => draftProfileFromCv(await readCv(file)),
    onSuccess: (result) => {
      setNotice(null);
      setDraft(result);
    },
    onError: (err, file) => {
      if (code(err) === NOT_AGREED) setWaiting({ kind: "cv", file });
      else if (CV_REFUSALS.has(code(err) ?? "")) setCvRefusal(err.message);
    },
  });
  const agree = useMutation({
    mutationFn: agreeNotice,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["matching", "settings"] });
      const next = waiting;
      setWaiting(null);
      if (next?.kind === "profile") save.mutate(next.profile);
      if (next?.kind === "cv") cv.mutate(next.file);
    },
  });

  const agreed = () => Boolean(settings.data?.notice_agreed_at || agree.isSuccess);
  const submit = (profile: ProfileData) => {
    setNotice(null);
    if (!agreed()) setWaiting({ kind: "profile", profile });
    else save.mutate(profile);
  };
  const upload = (file: File) => {
    cv.reset();
    const refusal = refuseCv(file);
    setCvRefusal(refusal);
    if (refusal) return;
    if (!agreed()) setWaiting({ kind: "cv", file });
    else cv.mutate(file);
  };

  if (settings.isPending)
    return (
      <div className="flex flex-col gap-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  if (settings.isError)
    return (
      <InlineBanner tone="error" title="Couldn't load your profile." onRetry={() => void settings.refetch()}>
        {settings.error.message}
      </InlineBanner>
    );

  const data = settings.data;
  const saveCode = code(save.error);
  const saveBanner =
    save.error && saveCode !== NOT_AGREED ? (
      VALIDATION.has(saveCode ?? "") ? (
        <InlineBanner tone="error" title={save.error.message} />
      ) : (
        <InlineBanner
          tone="error"
          title="Couldn't save your profile."
          onRetry={() => save.variables && save.mutate(save.variables)}
        >
          {save.error.message}
        </InlineBanner>
      )
    ) : notice ? (
      <InlineBanner tone="info" title={notice} />
    ) : undefined;

  const cvCode = code(cv.error);
  const cvBanner =
    cv.error && cvCode !== NOT_AGREED && !CV_REFUSALS.has(cvCode ?? "") ? (
      cvCode === "MATCHING_CAP_REACHED" ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-card border border-danger bg-surface-muted p-3 text-sm"
        >
          <p className="font-medium">{cv.error.message}</p>
          <a
            href="#scoring-cap"
            className="inline-flex min-h-11 items-center self-start text-accent underline"
          >
            Change cap
          </a>
        </div>
      ) : (
        <InlineBanner tone="error" title={cv.error.message}>
          Upload again later, or fill in the profile by hand.
        </InlineBanner>
      )
    ) : undefined;

  const footer = waiting && (
    <DataNotice
      onAgree={() => agree.mutate()}
      onDecline={() => setWaiting(null)}
      agreeing={agree.isPending}
      error={agree.isError ? agree.error.message : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{data.profile ? "Your profile" : "Set up your profile"}</h1>
        {draft ? (
          <DraftReview
            draft={draft}
            onUse={submit}
            onDiscard={() => setDraft(null)}
            saving={save.isPending}
            banner={saveBanner}
            footer={footer}
          />
        ) : (
          <>
            <CvUpload onFile={upload} pending={cv.isPending} error={cvRefusal ?? undefined} />
            {/* The notice shows in place of the action that triggered it (screens.md SCR-03, review R17). */}
            {waiting?.kind === "cv" && footer}
            {cvBanner}
            {!data.profile && <p className="text-sm text-text-muted">— or fill it in —</p>}
            <ProfileForm
              key={data.profile_version}
              initial={data.profile}
              onSave={submit}
              saving={save.isPending}
              banner={saveBanner}
              footer={waiting?.kind === "profile" ? footer : undefined}
            />
          </>
        )}
      </section>
      <div id="scoring-cap">
        <CapField
          settings={data}
          onSave={(cents) =>
            setScoringCap(cents).then((saved) => {
              queryClient.setQueryData(["matching", "settings"], saved);
              void queryClient.invalidateQueries({ queryKey: ["matching", "health"] });
              return saved;
            })
          }
        />
      </div>
    </div>
  );
}
