import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/env';

export function OnlineCounter() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    const fetchCount = () => {
      fetch(apiUrl('/api/online'))
        .then((r) => r.json())
        .then((d) => mounted && setCount(d.online))
        .catch(() => {});
    };
    fetchCount();
    const iv = setInterval(fetchCount, 15000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);
  return <div className="text-sm text-white/70">{count === null ? '...' : `${count} онлайн`}</div>;
}



