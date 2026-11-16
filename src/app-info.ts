import { version } from '../package.json';

export const APP_NAME = 'IFRSim';
export const TRAINING_DISCLAIMER = 'Training use only — not for navigation';

/** Which build is running. CI sets the commit and date; a local build has neither. */
export interface BuildInfo {
  readonly version: string;
  /** Full commit SHA, or '' for a local build. */
  readonly sha: string;
  /** Build date (YYYY-MM-DD, UTC), or ''. */
  readonly date: string;
}

/** "v1.0.0 · a740789 · 2026-11-16", or "v1.0.0 · dev" for a local build. */
export function formatBuildStamp(b: BuildInfo): string {
  const parts = [`v${b.version}`, b.sha ? b.sha.slice(0, 7) : 'dev'];
  if (b.sha && b.date) parts.push(b.date);
  return parts.join(' · ');
}

export const BUILD: BuildInfo = {
  version,
  sha: import.meta.env.VITE_BUILD_SHA ?? '',
  date: import.meta.env.VITE_BUILD_DATE ?? '',
};

export const BUILD_STAMP = formatBuildStamp(BUILD);
