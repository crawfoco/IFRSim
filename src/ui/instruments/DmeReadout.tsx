/** DME distance readout. Shows dashes when the selected source has no DME or is out of range. */
export function formatDme(nm: number | null): string {
  if (nm === null) return '--.-';
  return nm >= 100 ? Math.round(nm).toString() : nm.toFixed(1);
}

export function DmeReadout({ nm, source }: { nm: number | null; source: 1 | 2 }) {
  const text = formatDme(nm);
  return (
    <div
      className="dme"
      data-testid="dme"
      role="status"
      aria-label={`DME from NAV${source}: ${nm === null ? 'no reading' : `${text} miles`}`}
    >
      <span className="dme-src">NAV{source}</span>
      <span className="dme-value" data-testid="dme-value">
        {text}
      </span>
      <span className="dme-unit">NM</span>
    </div>
  );
}
