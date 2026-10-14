import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { chooseCountry, type LocationFilter, setLook } from "../../api/remoteFilter";
import { Button } from "../../components/Button";
import { InlineBanner } from "../../components/InlineBanner";
import { SkeletonRow } from "../../components/SkeletonRow";
import { CountryChoice } from "./CountryChoice";
import { SETTINGS_KEY, type Switch, useFilterSwitch, useRemoteFilterSettings } from "./queries";

interface LocationFilterBarProps {
  /** The filter the list on screen was built with: the bar describes that list, never a pending setting. */
  filter: LocationFilter | undefined;
  /** After any confirmed change: run the search again from the top (ADR-0002). */
  onChange: () => void;
}

/** SCR-01 location bar (screens.md NEW: LocationFilterBar): the filter's state and its actions. */
export function LocationFilterBar({ filter, onChange }: LocationFilterBarProps) {
  const settings = useRemoteFilterSettings();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<"own" | "look" | null>(null);
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    onChange();
  };
  const switching = useFilterSwitch(onChange);

  if (settings.isError)
    return (
      <InlineBanner tone="error" title={settings.error.message} onRetry={() => void settings.refetch()} />
    );
  if (!settings.data || !filter) return <SkeletonRow />;

  const own = settings.data.country;
  const country = filter.country;
  const text = {
    none: "Choose your country to hide roles you can't take from there",
    own: `Open to ${country?.flag} ${country?.name}`,
    off: "Location filter is off",
    look: `Showing postings open to ${country?.flag} ${country?.name}`,
  }[filter.mode];

  const action = (label: string, onClick: () => void, which?: Switch) => (
    <Button
      key={label}
      onClick={onClick}
      pending={which !== undefined && switching.isPending && switching.variables === which}
      disabled={switching.isPending}
    >
      {label}
    </Button>
  );
  const actions = {
    none: [
      action("Choose country", () => setChoice("own")),
      action("Look at another country", () => setChoice("look")),
    ],
    own: [
      action("Change", () => setChoice("own")),
      action("Other country", () => setChoice("look")),
      action("Switch off", () => switching.mutate("off"), "off"),
    ],
    off: [action("Switch on", () => switching.mutate("on"), "on")],
    look: [
      action(own ? `Back to ${own.name}` : "Back to all postings", () => switching.mutate("back"), "back"),
    ],
  }[filter.mode];

  return (
    <section aria-label="Location filter" className="flex flex-col gap-2">
      <p>{text}</p>
      {switching.isError && (
        <InlineBanner
          tone="error"
          title={switching.error.message}
          onRetry={() => switching.mutate(switching.variables)}
        />
      )}
      {choice ? (
        <CountryChoice
          purpose={choice}
          countries={settings.data.countries}
          onSubmit={(name) => (choice === "own" ? chooseCountry(name) : setLook(name))}
          onDone={() => {
            setChoice(null);
            changed();
          }}
          onCancel={() => setChoice(null)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">{actions}</div>
      )}
    </section>
  );
}
