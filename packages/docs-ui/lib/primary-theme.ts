type Rgb = [number, number, number];

function luminance(color: Rgb): number {
  const linear = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function primaryPalette(hex: string) {
  const color: Rgb = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const brightness = (0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]) / 255;
  const adjusted = (multiplier: number) =>
    `rgb(${color.map((channel) => Math.min(255, Math.round(channel * multiplier))).join(',')})`;
  const backgroundLuminance = luminance(color);
  const whiteContrast = 1.05 / (backgroundLuminance + 0.05);
  const darkContrast = (backgroundLuminance + 0.05) / (luminance([10, 10, 10]) + 0.05);
  const foreground = whiteContrast >= darkContrast ? '#ffffff' : '#0a0a0a';
  const textMultiplier =
    brightness > 0.9
      ? 0.45
      : brightness > 0.7
        ? 0.88
        : brightness > 0.5
          ? 0.92
          : brightness < 0.15
            ? 3.5
            : brightness < 0.3
              ? 2
              : 1;
  const darkTextMultiplier =
    brightness < 0.15 ? 4 : brightness < 0.3 ? 2.2 : brightness < 0.4 ? 1.4 : 1;
  const tintMultiplier = brightness > 0 ? Math.max(1, 0.45 / brightness) : 6;
  return {
    // Keep the configured fill in both themes. Brighten standalone accents separately.
    background: adjusted(1),
    foreground,
    lightText: adjusted(textMultiplier),
    darkText: adjusted(darkTextMultiplier),
    cardTint: adjusted(Math.min(tintMultiplier, 10)),
  };
}

export function primaryThemeCss(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '';
  const p = primaryPalette(hex);
  const shared = `--color-primary:${p.background}!important;--color-primary-foreground:${p.foreground}!important;--primary-card-tint:${p.cardTint}`;
  return `html{${shared};--primary-text:${p.lightText}}html.dark{${shared};--primary-text:${p.darkText}}@media(prefers-color-scheme:dark){html:not(.light){${shared};--primary-text:${p.darkText}}}`;
}
