import { useEffect, useRef } from 'react';

type Message = { from: 'me' | 'peer' | 'sys'; text: string; ts: number };

type Props = {
  messages: Message[];
  onSend: (text: string) => void;
};

export function ChatPanel({ messages, onSend }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  return (
    <div className="card flex flex-col h-64 md:h-80">
      <div ref={ref} className="flex-1 overflow-y-auto space-y-1 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.from === 'me' ? 'text-blue-300' : m.from === 'peer' ? 'text-green-300' : 'text-white/60'}`}>
            <span className="text-white/40 mr-2">{new Date(m.ts).toLocaleTimeString()}</span>
            <span>{m.text}</span>
          </div>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const text = String(fd.get('text') || '').trim();
          if (text) onSend(text);
          (e.currentTarget.elements.namedItem('text') as HTMLInputElement).value = '';
        }}
      >
        <input
          name="text"
          className="flex-1 bg-black/30 rounded px-3 py-2 outline-none"
          placeholder="Ваше сообщение..."
          autoComplete="off"
        />
        <button type="submit" className="btn w-32">
          Отправить
        </button>
      </form>
    </div>
  );
}


