/** Tiny SVG route preview from [[lat,lng], ...] — no Leaflet needed. */
export function RunMapThumb({
  polyline = [],
  theme,
  height = 120,
  accent,
  onClick,
  label,
  sublabel,
}) {
  const points = (polyline || []).filter((p) => Array.isArray(p) && p.length >= 2);
  const stroke = accent || theme?.orange || '#fc5200';

  let pathD = '';
  if (points.length >= 2) {
    const lats = points.map((p) => Number(p[0]));
    const lngs = points.map((p) => Number(p[1]));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const pad = 8;
    const w = 280;
    const h = height;
    const spanLat = Math.max(0.00001, maxLat - minLat);
    const spanLng = Math.max(0.00001, maxLng - minLng);
    // Keep aspect roughly square-ish inside the box
    const scale = Math.min((w - pad * 2) / spanLng, (h - pad * 2) / spanLat);
    const offsetX = (w - spanLng * scale) / 2;
    const offsetY = (h - spanLat * scale) / 2;
    pathD = points.map((p, i) => {
      const x = offsetX + (Number(p[1]) - minLng) * scale;
      const y = offsetY + (maxLat - Number(p[0])) * scale;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        display: 'grid',
        gap: 8,
        padding: 0,
        border: `1px solid ${theme?.cardBorder || '#ddd'}`,
        borderRadius: 16,
        overflow: 'hidden',
        background: theme?.cardBg || '#fff',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
        color: 'inherit',
        width: '100%',
      }}
    >
      <div style={{
        height,
        background: `linear-gradient(160deg, ${theme?.pageBgSolid || '#0f172a'} 0%, ${theme?.cardBg || '#1e293b'} 100%)`,
        position: 'relative',
      }}
      >
        {pathD ? (
          <svg viewBox={`0 0 280 ${height}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="xMidYMid meet">
            <path d={pathD} fill="none" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
          </svg>
        ) : (
          <div style={{
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            color: theme?.textMuted || '#94a3b8',
            fontSize: 12,
            padding: 12,
            textAlign: 'center',
          }}
          >
            Map not cached yet — open run to import
          </div>
        )}
      </div>
      {(label || sublabel) ? (
        <div style={{ padding: '0 12px 12px' }}>
          {label ? <div style={{ fontSize: 13, fontWeight: 800, color: theme?.textHeading || '#fff' }}>{label}</div> : null}
          {sublabel ? <div style={{ fontSize: 11, color: theme?.textMuted || '#94a3b8', marginTop: 2 }}>{sublabel}</div> : null}
        </div>
      ) : null}
    </Wrapper>
  );
}
