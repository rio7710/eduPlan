export type FontToken = {
  fontFamily: string;
  fontSize: number;
  color: string;
};

export type FontSettings = {
  headings: Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', FontToken>;
  bullets: {
    unordered: FontToken;
    ordered: FontToken;
  };
};

export const themeAwareLightColor = '#111827';
export const themeAwareDarkColor = '#f3f4f6';
export const themeAwareAutoColorToken = 'theme:auto';

export const themeAwareFontColors = {
  [themeAwareAutoColorToken]: { light: themeAwareLightColor, dark: themeAwareDarkColor },
  'theme:red': { light: '#b91c1c', dark: '#f87171' },
  'theme:orange': { light: '#c2410c', dark: '#fb923c' },
  'theme:yellow': { light: '#a16207', dark: '#facc15' },
  'theme:green': { light: '#15803d', dark: '#4ade80' },
  'theme:sky': { light: '#0369a1', dark: '#38bdf8' },
  'theme:blue': { light: '#1d4ed8', dark: '#60a5fa' },
  'theme:purple': { light: '#6d28d9', dark: '#a78bfa' },
} as const;

export type ThemeAwareFontColorKey = keyof typeof themeAwareFontColors;

export const fontFamilyOptions = [
  'Pretendard',
  '"Noto Sans KR"',
  '"Apple SD Gothic Neo"',
  '"Malgun Gothic"',
  '"Nanum Gothic"',
  'Georgia',
  '"Times New Roman"',
  '"Courier New"',
];

export const defaultFontSettings: FontSettings = {
  headings: {
    h1: { fontFamily: 'Pretendard', fontSize: 30, color: themeAwareAutoColorToken },
    h2: { fontFamily: 'Pretendard', fontSize: 24, color: themeAwareAutoColorToken },
    h3: { fontFamily: 'Pretendard', fontSize: 20, color: themeAwareAutoColorToken },
    h4: { fontFamily: 'Pretendard', fontSize: 18, color: themeAwareAutoColorToken },
    h5: { fontFamily: 'Pretendard', fontSize: 16, color: themeAwareAutoColorToken },
    h6: { fontFamily: 'Pretendard', fontSize: 14, color: themeAwareAutoColorToken },
  },
  bullets: {
    unordered: { fontFamily: 'Pretendard', fontSize: 16, color: themeAwareAutoColorToken },
    ordered: { fontFamily: 'Pretendard', fontSize: 16, color: themeAwareAutoColorToken },
  },
};

export function mergeFontSettings(input: Partial<FontSettings> | null | undefined): FontSettings {
  return {
    headings: {
      h1: { ...defaultFontSettings.headings.h1, ...input?.headings?.h1 },
      h2: { ...defaultFontSettings.headings.h2, ...input?.headings?.h2 },
      h3: { ...defaultFontSettings.headings.h3, ...input?.headings?.h3 },
      h4: { ...defaultFontSettings.headings.h4, ...input?.headings?.h4 },
      h5: { ...defaultFontSettings.headings.h5, ...input?.headings?.h5 },
      h6: { ...defaultFontSettings.headings.h6, ...input?.headings?.h6 },
    },
    bullets: {
      unordered: { ...defaultFontSettings.bullets.unordered, ...input?.bullets?.unordered },
      ordered: { ...defaultFontSettings.bullets.ordered, ...input?.bullets?.ordered },
    },
  };
}

export function readStoredFontSettings() {
  const raw = window.localStorage.getItem('eduplan-font-settings');
  if (!raw) {
    return defaultFontSettings;
  }

  try {
    return mergeFontSettings(JSON.parse(raw) as Partial<FontSettings>);
  } catch {
    return defaultFontSettings;
  }
}

export function resolveFontColor(color: string, theme: 'dark' | 'light') {
  const normalized = color.trim().toLowerCase();
  if (!normalized || normalized === themeAwareLightColor || normalized === themeAwareDarkColor) {
    return theme === 'light' ? themeAwareLightColor : themeAwareDarkColor;
  }

  const themeAwareColor = themeAwareFontColors[normalized as ThemeAwareFontColorKey];
  if (themeAwareColor) {
    return themeAwareColor[theme];
  }

  return color;
}
