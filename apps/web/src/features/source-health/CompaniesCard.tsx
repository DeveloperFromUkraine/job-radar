// SCR-02: the companies whose own job boards are read (company-boards) — add one by its site or
// board link, remove one found by mistake. Names are untrusted source text: rendered only as text.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { addCompany, type Company, getCompanies, removeCompany } from "../../api/collector";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { InlineBanner } from "../../components/InlineBanner";
import { SkeletonRow } from "../../components/SkeletonRow";

const SHOWN = 20;
const ORIGINS: Record<Company["origin"], string> = {
  link: "linked from a posting",
  probe: "found by name",
  theirstack: "found via TheirStack",
  manual: "added by you",
};
const SYSTEMS: Record<Company["ats"], string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };

function roles(c: Company): string {
  if (c.last_checked_at === null) return "not read yet";
  if (c.last_result === "failed") return "last read failed";
  return c.open_roles === 1 ? "1 remote role" : `${c.open_roles ?? 0} remote roles`;
}

export function CompaniesCard() {
  const id = useId();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["collector", "companies"], queryFn: getCompanies });
  const [url, setUrl] = useState("");
  const [all, setAll] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["collector", "companies"] });
  const add = useMutation({
    mutationFn: addCompany,
    onSuccess: () => {
      setUrl("");
      void refresh();
    },
  });
  const remove = useMutation({ mutationFn: removeCompany, onSettled: refresh });

  if (list.isPending) return <SkeletonRow />;
  if (list.isError) {
    return (
      <InlineBanner tone="error" title="Couldn't load the companies." onRetry={() => void list.refetch()}>
        {list.error.message}
      </InlineBanner>
    );
  }
  const companies = list.data.companies;
  const shown = all ? companies : companies.slice(0, SHOWN);

  return (
    <article className="flex flex-col gap-2 rounded-card border border-border p-3 text-sm">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Company job boards</h2>
        <Badge tone="enabled">{companies.length}</Badge>
      </header>
      <p className="text-text-muted">
        Remote roles straight from companies' own Greenhouse, Lever and Ashby boards, often before the job
        boards have them. New companies are found from the postings collected.
      </p>
      <form
        className="flex flex-col gap-2 md:flex-row md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) add.mutate(url.trim());
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`${id}-url`}>Add a company by its site or job board link</label>
          <input
            id={`${id}-url`}
            type="text"
            inputMode="url"
            placeholder="linear.app or jobs.ashbyhq.com/linear"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="min-h-11 rounded-card border border-border bg-surface px-3 text-text"
          />
        </div>
        <Button type="submit" pending={add.isPending} disabled={!url.trim()}>
          Add company
        </Button>
      </form>
      {add.isError && <InlineBanner tone="error" title={add.error.message} />}
      {add.isSuccess && (
        <InlineBanner
          tone="info"
          title={`${add.data.name} is on the list. Its board is read in the next run.`}
        />
      )}
      {remove.isError && <InlineBanner tone="error" title={remove.error.message} />}

      {companies.length === 0 ? (
        <p>No companies yet. They are found as postings are collected.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-1">
              <span className="min-w-0">
                <a
                  href={c.board_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  {c.name}
                </a>{" "}
                <span className="text-text-muted">
                  · {roles(c)} · {SYSTEMS[c.ats]}, {ORIGINS[c.origin]}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove.mutate(c.id)}
                disabled={remove.isPending}
                aria-label={`Remove ${c.name}`}
                className="inline-flex min-h-11 shrink-0 items-center rounded border border-border px-3 text-text"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {companies.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="inline-flex min-h-11 items-center self-start rounded border border-border px-3 text-text"
        >
          {all ? "Show fewer" : `Show all ${companies.length}`}
        </button>
      )}
    </article>
  );
}
