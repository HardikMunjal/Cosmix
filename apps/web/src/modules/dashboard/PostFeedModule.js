const defaultPostImages = {
  running: 'https://images.unsplash.com/photo-1517430816045-df4b7de11d14?auto=format&fit=crop&w=1200&q=80',
  cycling: 'https://images.unsplash.com/photo-1508606572321-901ea4437072?auto=format&fit=crop&w=1200&q=80',
  yoga: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80',
  strength: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  team: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80',
  default: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
};

function getPostImage(post) {
  const text = String(post.activityType || post.title || post.body || '').toLowerCase();
  if (text.includes('run') || text.includes('running') || text.includes('marathon') || text.includes('km')) return defaultPostImages.running;
  if (text.includes('cycle') || text.includes('cycling') || text.includes('ride') || text.includes('bike')) return defaultPostImages.cycling;
  if (text.includes('yoga') || text.includes('stretch') || text.includes('meditation')) return defaultPostImages.yoga;
  if (text.includes('lift') || text.includes('weights') || text.includes('strength') || text.includes('gym')) return defaultPostImages.strength;
  if (text.includes('team') || text.includes('buddy') || text.includes('community')) return defaultPostImages.team;
  return defaultPostImages.default;
}

const sampleFeedPosts = [
  {
    id: 'fitstagram-1',
    authorName: 'Hardi',
    activityType: 'Running',
    title: 'Morning endurance run',
    body: 'Just completed 8.3 km with a strong steady pace. Legs feel great and energy is high!',
    createdAt: new Date(Date.now() - 1000 * 3600 * 1).toISOString(),
    likes: 128,
    comments: ['Awesome!', 'Keep it up!'],
    imageUrl: defaultPostImages.running,
  },
  {
    id: 'fitstagram-2',
    authorName: 'Sara',
    activityType: 'Cycling',
    title: 'Sunrise ride',
    body: 'Covered 22 km around the lake and hit a new hill PR. Good morning vibes!',
    createdAt: new Date(Date.now() - 1000 * 3600 * 3).toISOString(),
    likes: 96,
    comments: ['Goals!', 'That route looks epic.'],
    imageUrl: defaultPostImages.cycling,
  },
  {
    id: 'fitstagram-3',
    authorName: 'Sam',
    activityType: 'Strength',
    title: 'Gym session',
    body: 'Crushed a full lower-body session today. Feeling strong and ready for the next run.',
    createdAt: new Date(Date.now() - 1000 * 3600 * 5).toISOString(),
    likes: 78,
    comments: ['Nice work!', 'That energy!'],
    imageUrl: defaultPostImages.strength,
  },
];

function formatTimeLabel(createdAt) {
  const created = createdAt ? new Date(createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) return 'recently';
  const hours = Math.max(0, Math.round((Date.now() - created.getTime()) / 3600000));
  return `${hours}h ago`;
}

export default function PostFeedModule({ posts = [], theme, onLike = () => {} }) {
  const displayPosts = posts.length > 0 ? posts : sampleFeedPosts;

  return (
    <section
      style={{
        display: 'grid',
        gap: '18px',
      }}
    >
      {displayPosts.map((post) => {
        const timeLabel = formatTimeLabel(post.createdAt);
        const imageUrl = post.imageUrl || getPostImage(post);
        return (
          <article
            key={post.id}
            style={{
              borderRadius: '24px',
              border: `1px solid ${theme.cardBorder}`,
              background: theme.cardBg,
              overflow: 'hidden',
              display: 'grid',
              gap: '0px',
              boxShadow: `0 18px 32px ${theme.shadow}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '999px', background: theme.blue, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '14px' }}>{String(post.authorName || 'U').slice(0, 1).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: theme.textHeading }}>{post.authorName || 'Fitness friend'}</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>{post.activityType || 'Fitness update'}</div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 700 }}>{timeLabel}</div>
            </div>

            <div style={{ position: 'relative', minHeight: '250px', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={post.title || 'Fitness post image'} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px', background: 'linear-gradient(180deg, transparent, rgba(15,23,42,0.9))' }}>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{post.title || `${post.authorName || 'Someone'} just finished a workout`}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.88)', marginTop: '6px' }}>{post.body || 'Fitness progress update.'}</div>
              </div>
            </div>

            <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <div style={{ fontSize: '12px', letterSpacing: '0.08em', color: theme.textMuted, textTransform: 'uppercase' }}>Stats</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: theme.textHeading }}>{post.activityType === 'Running' ? `${String(post.body).match(/\d+\.\d+ km/)?.[0] || '8.3 km'}` : `${post.likes || 0} likes`}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onLike(post.id)}
                    style={{
                      borderRadius: '999px',
                      border: `1px solid ${theme.cyan}33`,
                      background: `${theme.cyan}12`,
                      color: theme.cyan,
                      padding: '10px 16px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '12px',
                    }}
                  >
                    ❤️ Like
                  </button>
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>{post.comments?.length ? `${post.comments.length} comments` : 'No comments yet'}</span>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
