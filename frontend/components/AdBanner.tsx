import { useEffect, useState } from 'react';

type Ad = { id: number; slot: string; image_url: string; link_url: string; is_active: number; impressions: number };

export function AdBanner({ slot = 'main' }: { slot?: string }) {
  const [ad, setAd] = useState<Ad | null>(null);
  useEffect(() => {
    let mounted = true;
    fetch('/api/ads')
      .then((r) => r.json())
      .then((d) => {
        if (!mounted) return;
        const found = (d.ads as Ad[]).find((x) => x.slot === slot) || (d.ads as Ad[])[0] || null;
        if (found) {
          setAd(found);
          fetch('/api/ads/impression', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: found.id })
          }).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [slot]);
  if (!ad) return null;
  return (
    <a href={ad.link_url} target="_blank" rel="noreferrer" className="block card overflow-hidden">
      <img src={ad.image_url} alt="ad" className="w-full h-28 object-cover rounded" />
    </a>
  );
}



