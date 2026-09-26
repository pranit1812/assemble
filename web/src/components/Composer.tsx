import { useEffect, useRef, useState } from 'react';

async function toDataUrl(file: File, max = 1024): Promise<string> {
  const img = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

const SR = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export function Composer({ onSubmit, busy, size = 'hero', placeholders, autoFocus }: {
  onSubmit: (text: string, image?: string) => void;
  busy?: boolean;
  size?: 'hero' | 'dock';
  placeholders: string[];
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | undefined>();
  const [listening, setListening] = useState(false);
  const [drag, setDrag] = useState(false);
  const [ph, setPh] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const rec = useRef<any>(null);
  const hero = size === 'hero';

  useEffect(() => {
    const t = setInterval(() => setPh((i) => (i + 1) % placeholders.length), 3400);
    return () => clearInterval(t);
  }, [placeholders.length]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const attach = async (f?: File | null) => { if (f && f.type.startsWith('image/')) setImage(await toDataUrl(f)); };

  const submit = () => {
    if (busy || (!text.trim() && !image)) return;
    rec.current?.stop();
    onSubmit(text.trim(), image);
    setText(''); setImage(undefined);
  };

  const mic = () => {
    if (!SR) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SR();
    r.lang = 'en-GB'; r.interimResults = true; r.continuous = false;
    r.onresult = (e: any) => setText(Array.from(e.results).map((x: any) => x[0].transcript).join(''));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); attach(e.dataTransfer.files[0]); }}
      className={`composer group relative rounded-[30px] border bg-card/90 backdrop-blur-xl transition-all duration-300
        ${drag ? 'border-accent ring-4 ring-accent/15' : 'border-line focus-within:border-ink/25 focus-within:shadow-[0_0_0_6px_rgb(194_65_12_/_0.06),var(--shadow-soft)]'}
        shadow-[var(--shadow-soft)] ${hero ? 'p-3 pl-5' : 'p-2 pl-4'}`}>
      {image && (
        <div className="rise mb-2 mt-1 flex items-center gap-3">
          <div className="relative">
            <img src={image} alt="Your photo" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-line" />
            <button onClick={() => setImage(undefined)} aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] text-paper">×</button>
          </div>
          <span className="text-[13px] text-muted">I'll look at what you already have.</span>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <div className="relative flex-1">
          <textarea ref={ta} value={text} rows={1} autoFocus={autoFocus} onChange={(e) => setText(e.target.value)}
            onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); attach(f); } }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            aria-label="Describe your goal"
            className={`block w-full resize-none bg-transparent text-ink outline-none ${hero ? 'min-h-[48px] py-3 text-[18px]' : 'min-h-[40px] py-2.5 text-[16px]'}`} />
          {!text && (
            <span key={ph} className={`ph-swap pointer-events-none absolute left-0 truncate text-faint ${hero ? 'top-3 text-[18px]' : 'top-2.5 text-[16px]'}`} style={{ right: 8 }}>
              {listening ? 'Listening…' : placeholders[ph]}
            </span>
          )}
        </div>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" onClick={() => file.current?.click()} aria-label="Attach a photo" title="Attach a photo of what you have"
          className={`grid shrink-0 place-items-center rounded-full text-muted transition hover:bg-paper hover:text-ink ${hero ? 'h-12 w-12' : 'h-10 w-10'}`}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-8 9" /></svg>
        </button>
        {SR && (
          <button type="button" onClick={mic} aria-label={listening ? 'Stop listening' : 'Speak'} title="Speak"
            className={`relative grid shrink-0 place-items-center rounded-full transition ${hero ? 'h-12 w-12' : 'h-10 w-10'} ${listening ? 'bg-accent text-white' : 'text-muted hover:bg-paper hover:text-ink'}`}>
            {listening && <span className="mic-ring absolute inset-0 rounded-full" />}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
        )}
        <button type="button" onClick={submit} disabled={busy || (!text.trim() && !image)} aria-label="Go"
          className={`grid shrink-0 place-items-center rounded-full bg-ink text-paper transition duration-300 hover:scale-[1.04] disabled:scale-100 disabled:opacity-25 ${hero ? 'h-12 w-12' : 'h-10 w-10'}`}>
          {busy ? <span className="spin h-4 w-4 rounded-full border-2 border-paper/30 border-t-paper" />
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>}
        </button>
      </div>
    </div>
  );
}
