// Collect now (SCR-02 02-g, Flow 2): stays enabled during a run so a second press is answered in
// place (AC-16); the answer shows under the button.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, type CollectNowResult, collectNow, SOURCE_NAMES } from "../../api/collector";
import { Button } from "../../components/Button";
import { InlineBanner } from "../../components/InlineBanner";
import { until } from "../../lib/time";

function nextDueText(result: CollectNowResult, now: number): string {
  return result.next_due
    .filter((n) => n.next_due_at !== null)
    .map((n) => `${SOURCE_NAMES[n.source_id].name} ${until(n.next_due_at as string, now)}`)
    .join(" · ");
}

export function CollectNowAction() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: collectNow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collector"] }),
  });
  const error = mutation.error;
  const alreadyRunning = error instanceof ApiError && error.code === "COLLECTOR_RUN_IN_PROGRESS";

  return (
    <div className="flex flex-col gap-2">
      <Button pending={mutation.isPending} onClick={() => mutation.mutate()}>
        Collect now
      </Button>
      {mutation.data && !mutation.data.started && (
        <InlineBanner tone="info" title="Nothing can be read yet.">
          {nextDueText(mutation.data, Date.now())}
        </InlineBanner>
      )}
      {alreadyRunning && <InlineBanner tone="info" title="A run is already in progress." />}
      {error && !alreadyRunning && (
        <InlineBanner tone="error" title="Couldn't start a collection." onRetry={() => mutation.mutate()}>
          {error.message}
        </InlineBanner>
      )}
    </div>
  );
}
