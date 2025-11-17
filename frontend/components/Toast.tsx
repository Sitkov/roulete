import { useEffect, useState } from 'react';

export function Toast({ text, showForMs = 2500 }: { text: string; showForMs?: number }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), showForMs);
    return () => clearTimeout(t);
  }, [showForMs]);
  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="px-4 py-2 rounded-lg bg-black/70 text-white shadow-lg">{text}</div>
    </div>
  );
}



