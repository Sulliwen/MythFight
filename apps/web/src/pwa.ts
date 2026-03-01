export type PwaState = {
  needRefresh: boolean;
  offlineReady: boolean;
};

type Listener = () => void;
type ServiceWorkerUpdater = (reloadPage?: boolean) => Promise<void>;

let pwaState: PwaState = {
  needRefresh: false,
  offlineReady: false,
};

const listeners = new Set<Listener>();
let updateServiceWorker: ServiceWorkerUpdater | null = null;
let initialized = false;

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function patchState(nextPatch: Partial<PwaState>) {
  pwaState = { ...pwaState, ...nextPatch };
  notifyListeners();
}

export function subscribePwaState(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPwaStateSnapshot(): PwaState {
  return pwaState;
}

export async function refreshPwaApplication() {
  if (!updateServiceWorker) return;
  await updateServiceWorker(true);
}

export function initPwaRegistration() {
  if (initialized || typeof window === "undefined") {
    return;
  }
  initialized = true;

  if (import.meta.env.DEV) {
    return;
  }

  void import("virtual:pwa-register")
    .then(({ registerSW }) => {
      const updater = registerSW({
        immediate: true,
        onNeedRefresh() {
          patchState({ needRefresh: true });
        },
        onOfflineReady() {
          patchState({ offlineReady: true });
        },
      });

      updateServiceWorker = updater;
    })
    .catch((error: unknown) => {
      console.error("PWA registration failed", error);
    });
}
