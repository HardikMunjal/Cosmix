export const THREAD_WALLPAPERS = [
  { id: 'preset:midnight', label: 'Midnight', css: 'linear-gradient(165deg, #020617 0%, #0f172a 46%, #1e293b 100%)' },
  { id: 'preset:dusk', label: 'Dusk', css: 'linear-gradient(165deg, #1e1b4b 0%, #4c1d95 48%, #9f1239 100%)' },
  { id: 'preset:ocean', label: 'Ocean', css: 'linear-gradient(165deg, #082f49 0%, #0e7490 50%, #155e75 100%)' },
  { id: 'preset:forest', label: 'Forest', css: 'linear-gradient(165deg, #052e16 0%, #166534 48%, #14532d 100%)' },
  { id: 'preset:sand', label: 'Sand', css: 'linear-gradient(165deg, #431407 0%, #9a3412 46%, #a16207 100%)' },
  { id: 'preset:rose', label: 'Rose', css: 'linear-gradient(165deg, #4a044e 0%, #9d174d 50%, #be123c 100%)' },
];

export function resolveThreadWallpaper(thread) {
  const raw = String(thread?.wallpaperUrl || '').trim();
  if (raw.startsWith('preset:')) {
    const preset = THREAD_WALLPAPERS.find((item) => item.id === raw);
    return {
      background: preset?.css || THREAD_WALLPAPERS[0].css,
      backgroundImage: 'none',
    };
  }
  if (/^(https?:\/\/|\/|blob:)/i.test(raw)) {
    return {
      background: '#020617',
      backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.28), rgba(2,6,23,0.72)), url("${raw}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  const cover = String(thread?.coverImageUrl || '').trim();
  if (/^(https?:\/\/|\/|blob:)/i.test(cover) && thread?.coverMediaType !== 'video') {
    return {
      background: '#020617',
      backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.35), rgba(2,6,23,0.78)), url("${cover}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    background: THREAD_WALLPAPERS[0].css,
    backgroundImage: 'none',
  };
}
