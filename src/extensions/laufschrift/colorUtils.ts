import { ConfigurationValue } from './bannerSettings';

export const BLACK: string = '#000000';
export const WHITE: string = '#ffffff';

export interface IRgbColor {
  r: number;
  g: number;
  b: number;
}

export interface IBannerColors {
  backgroundColor?: string;
  textColor?: string;
  warnings: string[];
}

const RGB_PATTERN: RegExp = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;
const WHITE_RGB: IRgbColor = { r: 255, g: 255, b: 255 };
const MIN_CONTRAST_RATIO: number = 4.5;

function normalizeColorValue(value: ConfigurationValue): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed: string = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isValidCssColor(value: string): boolean {
  const style: CSSStyleDeclaration = document.createElement('span').style;
  style.color = value;
  return style.color !== '';
}

/** Semi-transparent colors are composited over white, the usual page background. */
export function parseRgbColor(value: string): IRgbColor | undefined {
  const match: RegExpExecArray = RGB_PATTERN.exec(value.trim());
  if (!match) {
    return undefined;
  }
  let alpha: number = 1;
  if (match[4] !== undefined) {
    alpha = parseFloat(match[4]) / (match[5] === '%' ? 100 : 1);
    alpha = Math.min(Math.max(alpha, 0), 1);
  }
  const blend: (channel: string) => number = (channel: string): number =>
    Math.round(Math.min(parseFloat(channel), 255) * alpha + 255 * (1 - alpha));
  return { r: blend(match[1]), g: blend(match[2]), b: blend(match[3]) };
}

export function resolveCssColor(value: string): IRgbColor | undefined {
  const probe: HTMLSpanElement = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = value;
  const parent: HTMLElement = document.body || document.documentElement;
  parent.appendChild(probe);
  try {
    return parseRgbColor(window.getComputedStyle(probe).color);
  } finally {
    parent.removeChild(probe);
  }
}

function toLinearChannel(channel: number): number {
  const value: number = channel / 255;
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function getRelativeLuminance(color: IRgbColor): number {
  return 0.2126 * toLinearChannel(color.r) + 0.7152 * toLinearChannel(color.g) + 0.0722 * toLinearChannel(color.b);
}

export function getContrastRatio(first: IRgbColor, second: IRgbColor): number {
  const firstLuminance: number = getRelativeLuminance(first);
  const secondLuminance: number = getRelativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

/** Prefer white while it meets WCAG AA, otherwise black (which then exceeds 4.5:1). */
export function getContrastingColor(color: IRgbColor): string {
  return getContrastRatio(color, WHITE_RGB) >= MIN_CONTRAST_RATIO ? WHITE : BLACK;
}

function validateColor(value: ConfigurationValue, propertyName: string, warnings: string[]): string | undefined {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    warnings.push(`Ignoring ${propertyName} because it is not a string.`);
    return undefined;
  }
  const color: string | undefined = normalizeColorValue(value);
  if (color !== undefined && !isValidCssColor(color)) {
    warnings.push(`Ignoring invalid ${propertyName} "${color}".`);
    return undefined;
  }
  return color;
}

function getAutoContrastColor(givenColor: string, propertyName: string, warnings: string[]): string | undefined {
  const rgb: IRgbColor | undefined = resolveCssColor(givenColor);
  if (!rgb) {
    warnings.push(`Could not compute a contrasting color for ${propertyName} "${givenColor}"; using the theme color instead.`);
    return undefined;
  }
  return getContrastingColor(rgb);
}

export function resolveBannerColors(backgroundColor: ConfigurationValue, textColor: ConfigurationValue): IBannerColors {
  const warnings: string[] = [];
  const background: string | undefined = validateColor(backgroundColor, 'backgroundColor', warnings);
  const text: string | undefined = validateColor(textColor, 'textColor', warnings);
  if (background !== undefined && text === undefined) {
    return {
      backgroundColor: background,
      textColor: getAutoContrastColor(background, 'backgroundColor', warnings),
      warnings: warnings
    };
  }
  if (text !== undefined && background === undefined) {
    return {
      backgroundColor: getAutoContrastColor(text, 'textColor', warnings),
      textColor: text,
      warnings: warnings
    };
  }
  return { backgroundColor: background, textColor: text, warnings: warnings };
}
