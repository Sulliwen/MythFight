import { createContext } from "react";
import type { Translations } from "./locales/fr";
import fr from "./locales/fr";

export type I18nContextValue = {
  locale: string;
  translations: Translations;
};

export const I18nContext = createContext<I18nContextValue>({
  locale: "fr",
  translations: fr,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale: "fr", translations: fr }}>
      {children}
    </I18nContext.Provider>
  );
}
