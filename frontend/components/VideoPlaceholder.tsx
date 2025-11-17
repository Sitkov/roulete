export function VideoPlaceholder({ label = 'Ожидание...', animate = true }: { label?: string; animate?: boolean }) {
  return (
    <div className="w-full h-full rounded-md bg-black relative overflow-hidden">
      <div className={`absolute inset-0 ${animate ? 'animate-pulse' : ''}`}>
        <div className="w-full h-full opacity-40"
             style={{ backgroundImage: 'repeating-linear-gradient(45deg, #222 0, #222 10px, #1a1a1a 10px, #1a1a1a 20px)' }} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="px-3 py-1 rounded bg-white/10 text-white/80 text-sm">{label}</div>
      </div>
    </div>
  );
}


