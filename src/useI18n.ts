// Language helpers backed by the settings context.

import { useAppState } from "./hooks/useAppState";
import { dateLocaleFor, dictFor, interpolate } from "./i18n";

export function useI18n() {
  const { settings } = useAppState();
  const language = settings?.language;
  const t = dictFor(language);
  return {
    t,
    language: language ?? "en",
    dateLocale: dateLocaleFor(language),
    tr: (template: string, vars: Record<string, string | number>) => interpolate(template, vars),
  };
}
