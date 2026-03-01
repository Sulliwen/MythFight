import { useSyncExternalStore } from "react";
import { getPwaStateSnapshot, refreshPwaApplication, subscribePwaState } from "../pwa";

export function usePwaRuntime() {
  const state = useSyncExternalStore(subscribePwaState, getPwaStateSnapshot, getPwaStateSnapshot);

  return {
    ...state,
    refreshApplication: refreshPwaApplication,
  };
}
