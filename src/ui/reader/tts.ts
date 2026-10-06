// Lectura en voz alta con la síntesis de voz del sistema (Web Speech API).

export interface TtsItem {
  text: string;
  el?: HTMLElement;
}

export interface TtsCallbacks {
  onItem: (index: number, item: TtsItem) => void;
  onQueueEnd: () => void;
  onState: (playing: boolean) => void;
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function listVoices(lang = "es"): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const all = speechSynthesis.getVoices();
  const base = lang.slice(0, 2).toLowerCase();
  const matching = all.filter((v) => v.lang.toLowerCase().startsWith(base));
  return (matching.length ? matching : all).sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
}

/** Divide textos largos en frases de tamaño razonable para la voz. */
export function splitForSpeech(text: string, max = 260): string[] {
  if (text.length <= max) return [text];
  const parts = text.split(/(?<=[.!?;:…])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length > max && cur) {
      out.push(cur.trim());
      cur = p;
    } else cur = `${cur} ${p}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((s) => (s.length > max * 1.6 ? s.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) ?? [s] : [s]));
}

export class TtsController {
  private items: TtsItem[] = [];
  private index = 0;
  private token = 0;
  playing = false;
  rate = 1;
  voiceName = "";
  lang = "es-ES";

  constructor(private cb: TtsCallbacks) {}

  load(items: TtsItem[]) {
    this.items = items.filter((i) => i.text.trim());
    this.index = 0;
  }

  get current(): number {
    return this.index;
  }

  play(from = this.index) {
    if (!ttsSupported()) return;
    this.index = from;
    this.playing = true;
    this.cb.onState(true);
    this.speak();
  }

  private speak() {
    const my = ++this.token;
    speechSynthesis.cancel();
    if (this.index >= this.items.length) {
      this.playing = false;
      this.cb.onState(false);
      this.cb.onQueueEnd();
      return;
    }
    const item = this.items[this.index];
    this.cb.onItem(this.index, item);
    const chunks = splitForSpeech(item.text);
    let k = 0;
    const sayNext = () => {
      if (my !== this.token) return;
      if (k >= chunks.length) {
        this.index++;
        this.speak();
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[k++]);
      u.rate = this.rate;
      u.lang = this.lang;
      const voice = speechSynthesis.getVoices().find((v) => v.name === this.voiceName);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.onend = () => sayNext();
      u.onerror = (e) => {
        if (my !== this.token) return;
        if (e.error === "interrupted" || e.error === "canceled") return;
        sayNext();
      };
      speechSynthesis.speak(u);
    };
    sayNext();
  }

  pause() {
    this.token++;
    this.playing = false;
    speechSynthesis.cancel();
    this.cb.onState(false);
  }

  stop() {
    this.pause();
    this.items = [];
    this.index = 0;
  }

  /** Aplica velocidad o voz nuevas reiniciando el párrafo actual. */
  restart() {
    if (this.playing) this.play(this.index);
  }
}
