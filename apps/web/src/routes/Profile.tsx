// SCR-03 — the profile (screens.md): the editor, the one-time data notice and the scoring cap.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../api/collector";
import { agreeNotice, type Profile as ProfileData, saveProfile, setScoringCap } from "../api/matching";
import { InlineBanner } from "../components/InlineBanner";
import { SkeletonRow } from "../components/SkeletonRow";
import { CapField } from "../features/matching/CapField";
import { DataNotice } from "../features/matching/DataNotice";
import { ProfileForm } from "../features/matching/ProfileForm";
import { useMatchingSettings } from "../features/matching/queries";

const VALIDATION = new Set(["MATCHING_INVALID_PROFILE", "VALIDATION_ERROR"]);

export function Profile() {
  const settings = useMatchingSettings();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  /** A profile waiting on the one-time notice (AC-20); nothing is sent while it waits. */
  const [waiting, setWaiting] = useState<ProfileData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["matching"] });
      if (result.changed) navigate("/");
      else setNotice("Nothing changed — your scores stay as they are.");
    },
    onError: (err, profile) => {
      if (err instanceof ApiError && err.code === "MATCHING_NOTICE_NOT_AGREED") setWaiting(profile);
    },
  });
  const agree = useMutation({
    mutationFn: agreeNotice,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["matching", "settings"] });
      const profile = waiting;
      setWaiting(null);
      if (profile) save.mutate(profile);
    },
  });

  const submit = (profile: ProfileData) => {
    setNotice(null);
    if (!settings.data?.notice_agreed_at) setWaiting(profile);
    else save.mutate(profile);
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
  const saveError =
    save.error && !(save.error instanceof ApiError && save.error.code === "MATCHING_NOTICE_NOT_AGREED");
  const banner =
    (saveError && save.error && (
      <InlineBanner
        tone="error"
        title={
          save.error instanceof ApiError && VALIDATION.has(save.error.code)
            ? save.error.message
            : "Couldn't save your profile."
        }
        onRetry={
          save.error instanceof ApiError && VALIDATION.has(save.error.code)
            ? undefined
            : () => save.variables && save.mutate(save.variables)
        }
      >
        {save.error instanceof ApiError && VALIDATION.has(save.error.code) ? undefined : save.error.message}
      </InlineBanner>
    )) ||
    (notice && <InlineBanner tone="info" title={notice} />) ||
    undefined;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{data.profile ? "Your profile" : "Set up your profile"}</h1>
        <ProfileForm
          initial={data.profile}
          onSave={submit}
          saving={save.isPending}
          banner={banner}
          footer={
            waiting && (
              <DataNotice
                onAgree={() => agree.mutate()}
                onDecline={() => setWaiting(null)}
                agreeing={agree.isPending}
                error={agree.isError ? agree.error.message : undefined}
              />
            )
          }
        />
      </section>
      <CapField settings={data} onSave={(cents) => setScoringCap(cents)} />
    </div>
  );
}
