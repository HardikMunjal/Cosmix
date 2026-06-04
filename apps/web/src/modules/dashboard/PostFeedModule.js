import { useEffect, useMemo, useState } from 'react';
import { pickSportImage, normalizeSportKey } from '../../lib/sportImages';

function formatTimeLabel(createdAt) {
  const created = createdAt ? new Date(createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) return 'recently';
  const diffMs = Date.now() - created.getTime();
  const hours = Math.max(0, Math.round(diffMs / 3600000));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatStats(post) {
  const metrics = post.metrics || {};
  if (metrics.distanceKm && metrics.minutes) {
    let paceLabel = '';
    if (metrics.pace && Number.isFinite(metrics.pace)) {
      const mins = Math.floor(metrics.pace);
      const secs = Math.round((metrics.pace - mins) * 60);
      paceLabel = ` · ${mins}:${String(secs).padStart(2, '0')} /km`;
    }
    return `${Number(metrics.distanceKm).toFixed(1)} km · ${metrics.minutes} min${paceLabel}`;
  }
  if (metrics.distanceKm) return `${Number(metrics.distanceKm).toFixed(1)} km`;
  if (metrics.minutes) return `${metrics.minutes} min`;
  return post.activityType || 'Session logged';
}

function PostImage({ post, theme }) {
  const sport = normalizeSportKey(post.sport || post.activityType);
  const candidates = useMemo(() => {
    const fromApi = Array.isArray(post.imageUrls) ? post.imageUrls : [];
    const primary = post.imageUrl ? [post.imageUrl] : [];
    const merged = [...primary, ...fromApi];
    if (!merged.length) merged.push(pickSportImage(sport, post.id));
    return [...new Set(merged.filter(Boolean))];
  }, [post.id, post.imageUrl, post.imageUrls, sport]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [post.id]);

  const src = candidates[Math.min(index, candidates.length - 1)] || candidates[0];

  return (
    <div style={{ position: 'relative', minHeight: '280px', overflow: 'hidden', background: theme.cardBorder }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${post.id}-${src}`}
        src={src}
        alt={post.title || 'Fitness post'}
        style={{ width: '100%', height: '280px', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
        onError={() => {
          setIndex((current) => {
            if (current + 1 < candidates.length) return current + 1;
            return current;
          });
        }}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px', background: 'linear-gradient(180deg, transparent, rgba(15,23,42,0.92))' }}>
        <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{post.title}</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.9)', marginTop: '6px', lineHeight: 1.45 }}>{post.body}</div>
      </div>
    </div>
  );
}

export default function PostFeedModule({ posts = [], theme, onLike = () => {}, onView = () => {} }) {
  if (!posts.length) {
    return (
      <div style={{ borderRadius: '20px', border: `1px solid ${theme.cardBorder}`, padding: '28px 20px', textAlign: 'center', color: theme.textMuted, fontSize: '14px', lineHeight: 1.5 }}>
        No buddy activity yet. Log a run or sport session in Wellness — your buddies will see it here.
      </div>
    );
  }

  return (
    <section style={{ display: 'grid', gap: '18px' }}>
      {posts.map((post) => {
        const timeLabel = formatTimeLabel(post.createdAt);
        const unseen = post.seen === false;
        const likeCount = Number(post.likes || 0);
        const likedByMe = Boolean(post.likedByMe);

        return (
          <article
            key={post.id}
            style={{
              borderRadius: '24px',
              border: unseen ? `2px solid ${theme.orange}66` : `1px solid ${theme.cardBorder}`,
              background: theme.cardBg,
              overflow: 'hidden',
              display: 'grid',
              gap: '0px',
              boxShadow: unseen ? `0 20px 40px ${theme.orange}22` : `0 18px 32px ${theme.shadow}`,
            }}
            onMouseEnter={() => onView(post.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '999px', background: theme.blue, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '14px' }}>
                  {String(post.authorName || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: theme.textHeading }}>{post.authorName || 'Fitness friend'}</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>{post.activityType || 'Fitness update'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {unseen ? (
                  <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.orange, background: `${theme.orange}18`, padding: '4px 8px', borderRadius: '999px' }}>New</span>
                ) : null}
                <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700 }}>{timeLabel}</div>
              </div>
            </div>

            <PostImage post={post} theme={theme} />

            <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <div style={{ fontSize: '12px', letterSpacing: '0.08em', color: theme.textMuted, textTransform: 'uppercase' }}>Session</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: theme.textHeading }}>{formatStats(post)}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onLike(post.id)}
                    disabled={likedByMe}
                    style={{
                      borderRadius: '999px',
                      border: `1px solid ${likedByMe ? theme.orange : theme.cyan}44`,
                      background: likedByMe ? `${theme.orange}22` : `${theme.cyan}12`,
                      color: likedByMe ? theme.orange : theme.cyan,
                      padding: '10px 16px',
                      cursor: likedByMe ? 'default' : 'pointer',
                      fontWeight: 700,
                      fontSize: '12px',
                      opacity: likedByMe ? 0.9 : 1,
                    }}
                  >
                    {likedByMe ? '❤️ Liked' : '❤️ Like'}{likeCount > 0 ? ` · ${likeCount}` : ''}
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
