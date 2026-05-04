import { useState } from 'react';

export interface AnimSettings {
  scrambleCharset: string;
  scrambleDurMs: number;
  scrambleStaggerMs: number;
  scrambleTickMs: number;
  digitRollDurMs: number;
  digitGlyphHeight: number;
  flashDurMs: number;
  hairlineGrowDurMs: number;
  contentRiseDurMs: number;
  flipDurMs: number;
  statusFlashDurMs: number;
  enableDecrypt: boolean;
  enableDigitRoll: boolean;
  enableTickFlash: boolean;
  enableFlip: boolean;
}

export const ANIM_DEFAULTS: AnimSettings = {
  scrambleCharset: '█▓▒░·▪◼◻∴∅±/[](){}<>0123456789ABCDEF',
  scrambleDurMs: 720,
  scrambleStaggerMs: 18,
  scrambleTickMs: 28,
  digitRollDurMs: 380,
  digitGlyphHeight: 18,
  flashDurMs: 240,
  hairlineGrowDurMs: 280,
  contentRiseDurMs: 320,
  flipDurMs: 480,
  statusFlashDurMs: 480,
  enableDecrypt: true,
  enableDigitRoll: true,
  enableTickFlash: true,
  enableFlip: true,
};

const STORAGE_KEY = 'sr.animSettings.v1';

function load(): AnimSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...ANIM_DEFAULTS };
    return { ...ANIM_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...ANIM_DEFAULTS };
  }
}

function save(s: AnimSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

type Setter = (k: keyof AnimSettings, v: AnimSettings[keyof AnimSettings]) => void;

export function useAnimSettings(): [AnimSettings, Setter, () => void] {
  const [settings, setSettings] = useState<AnimSettings>(load);

  const set: Setter = (k, v) => {
    setSettings(prev => {
      const next = { ...prev, [k]: v };
      save(next);
      return next;
    });
  };

  const reset = () => {
    save(ANIM_DEFAULTS);
    setSettings({ ...ANIM_DEFAULTS });
  };

  return [settings, set, reset];
}
