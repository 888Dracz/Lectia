// Estado efímero de la interfaz: avisos (toasts) y celebraciones.
import { create } from "zustand";
import { uid } from "../lib/util";

export interface Toast {
  id: string;
  text: string;
  icon?: string;
  tone?: "default" | "success" | "error" | "xp";
  action?: { label: string; run: () => void };
}

export interface Celebration {
  id: string;
  kind: "achievement" | "level" | "league";
  title: string;
  subtitle: string;
  icon: string;
}

interface UiState {
  toasts: Toast[];
  celebrations: Celebration[];
  busy: string | null;
  toast: (t: Omit<Toast, "id">, ms?: number) => void;
  dismissToast: (id: string) => void;
  celebrate: (c: Omit<Celebration, "id">) => void;
  shiftCelebration: () => void;
  setBusy: (msg: string | null) => void;
}

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  celebrations: [],
  busy: null,
  toast: (t, ms = 2800) => {
    const id = uid("t");
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    setTimeout(() => get().dismissToast(id), ms);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  celebrate: (c) => set({ celebrations: [...get().celebrations, { ...c, id: uid("c") }] }),
  shiftCelebration: () => set({ celebrations: get().celebrations.slice(1) }),
  setBusy: (busy) => set({ busy }),
}));

export const toast = (text: string, opts: Omit<Toast, "id" | "text"> = {}, ms?: number) => useUi.getState().toast({ text, ...opts }, ms);
