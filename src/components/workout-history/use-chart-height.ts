import { useSyncExternalStore } from "react";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

/** Server-render (and the first client paint) assume the mobile height. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Mobile-first chart height: charts use a compact height on phones and a taller
 * one from `md` up. Kept in one place so both detail charts agree on the sizes
 * and hydrate without a server/client mismatch.
 */
export function useChartHeight(mobile: number, desktop: number): number {
  const isDesktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isDesktop ? desktop : mobile;
}
