export const THREAD_WALLPAPERS = [
  { id: 'preset:midnight', label: 'Black', css: '#050505' },
  { id: 'preset:graphite', label: 'Graphite', css: 'linear-gradient(180deg, #0a0a0a 0%, #171717 100%)' },
  { id: 'preset:slate', label: 'Slate', css: 'linear-gradient(165deg, #020617 0%, #0f172a 100%)' },
  { id: 'preset:dusk', label: 'Dusk', css: 'linear-gradient(165deg, #0b0b12 0%, #1e1b4b 100%)' },
  { id: 'preset:ocean', label: 'Ocean', css: 'linear-gradient(165deg, #05080c 0%, #082f49 100%)' },
  { id: 'preset:forest', label: 'Forest', css: 'linear-gradient(165deg, #050805 0%, #052e16 100%)' },
];

export function resolveThreadWallpaper(thread) {
  const raw = String(thread?.wallpaperUrl || '').trim();
  if (raw.startsWith('preset:')) {
    const preset = THREAD_WALLPAPERS.find((item) => item.id === raw);
    return {
      background: preset?.css || '#050505',
      backgroundImage: 'none',
    };
  }
  if (/^(https?:\/\/|\/|blob:)/i.test(raw)) {
    return {
      background: '#050505',
      backgroundImage: `linear-gradient(180deg, rgba(5,5,5,0.35), rgba(5,5,5,0.82)), url("${raw}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    background: '#050505',
    backgroundImage: 'none',
  };
}
