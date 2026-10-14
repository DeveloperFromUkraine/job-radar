// The one country list the chooser and the filter share (ADR-0003), and a typed name's lookup (AC-05).
import { AppError } from "../../../core/errors.js";
import { type Country, countryByCode, countryList, lookupCountry } from "../domain/vocabulary.js";

export type { Country } from "../domain/vocabulary.js";
export { countryByCode };

export const countries = (): Country[] => countryList();

export function lookup(name: string): Country {
  const country = lookupCountry(name);
  if (!country) throw new AppError("REMOTE_FILTER_UNKNOWN_COUNTRY", "No country matches that name.", 400);
  return country;
}
