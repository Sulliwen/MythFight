import { useCallback, useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function isStandaloneMode(): boolean {
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = Boolean((window.navigator as NavigatorWithStandalone).standalone);
  return mediaStandalone || iosStandalone;
}

function detectIos(): boolean {
  const userAgent = window.navigator.userAgent;
  const isAppleMobile = /iphone|ipad|ipod/i.test(userAgent);
  const isTouchMac = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  return isAppleMobile || isTouchMac;
}

function detectSafari(): boolean {
  const userAgent = window.navigator.userAgent;
  return /safari/i.test(userAgent) && !/chrome|chromium|android/i.test(userAgent);
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    typeof window === "undefined" ? false : isStandaloneMode()
  );

  const isIosSafari = useMemo(() => {
    if (typeof window === "undefined") return false;
    return detectIos() && detectSafari();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = () => {
      setIsInstalled(isStandaloneMode());
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    mediaQuery.addEventListener("change", onDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mediaQuery.removeEventListener("change", onDisplayModeChange);
    };
  }, []);

  const installPromptAvailable = deferredPrompt !== null && !isInstalled;

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    return choice.outcome === "accepted";
  }, [deferredPrompt]);

  return {
    installPromptAvailable,
    promptInstall,
    showIosInstallHint: isIosSafari && !installPromptAvailable && !isInstalled,
    isInstalled,
  };
}
