// TypeScript 2.4 has no unknown type. Accept JSON values without permitting unchecked property access.
export type ConfigurationValue = {} | null | undefined;

export const DEFAULT_FONT_SIZE: number = 14;

export interface IFontSizeResult {
  fontSize: number;
  warnings: string[];
}

export function resolveFontSize(value: ConfigurationValue): IFontSizeResult {
  if (value === undefined) {
    return { fontSize: DEFAULT_FONT_SIZE, warnings: [] };
  }
  if (typeof value === 'number' && isFinite(value) && value >= 10 && value <= 72) {
    return { fontSize: value, warnings: [] };
  }
  return {
    fontSize: DEFAULT_FONT_SIZE,
    warnings: ['Ignoring invalid fontSize; expected a finite number from 10 to 72 pixels. Using 14px.']
  };
}
