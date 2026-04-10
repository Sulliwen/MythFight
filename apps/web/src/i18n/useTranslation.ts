import { useCallback, useContext } from "react";
import { I18nContext } from "./I18nProvider";
import type { TranslationKey } from "./types";

function resolve(obj: Record<string, unknown>, path: string): string {
  const result = path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
  return typeof result === "string" ? result : path;
}

export function useTranslation() {
  const { translations } = useContext(I18nContext);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      let text = resolve(
        translations as unknown as Record<string, unknown>,
        key,
      );
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [translations],
  );

  return { t };
}
