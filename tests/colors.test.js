'use strict';
const colors = require('../lib/extensions/laufschrift/colorUtils');
const white = { r: 255, g: 255, b: 255 };
const black = { r: 0, g: 0, b: 0 };

beforeEach(() => {
  const getComputedStyle = window.getComputedStyle.bind(window);
  // jsdom 11 retains named colors; browsers normalize these computed values to RGB.
  const named = {
    red: 'rgb(255, 0, 0)', navy: 'rgb(0, 0, 128)',
    blue: 'rgb(0, 0, 255)', black: 'rgb(0, 0, 0)'
  };
  jest.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const computed = getComputedStyle(element);
    return named[computed.color] ? { color: named[computed.color] } : computed;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

test('parses legacy and modern RGB values and composites alpha over white', () => {
  ['rgb(0, 120, 212)', 'rgb(0 120 212)'].forEach(value => {
    expect(colors.parseRgbColor(value)).toEqual({ r: 0, g: 120, b: 212 });
  });
  ['rgba(0, 0, 0, 0.5)', 'rgb(0 0 0 / 50%)'].forEach(value => {
    expect(colors.parseRgbColor(value)).toEqual({ r: 128, g: 128, b: 128 });
  });
  expect(colors.parseRgbColor('rgba(0, 0, 0, 0)')).toEqual(white);
  expect(colors.parseRgbColor('red')).toBeUndefined();
  expect(colors.parseRgbColor('oklch(0.5 0.1 200)')).toBeUndefined();
});

test('computes luminance and contrast with the original white preference', () => {
  expect(colors.getRelativeLuminance(black)).toBe(0);
  expect(colors.getRelativeLuminance(white)).toBeCloseTo(1);
  expect(colors.getContrastRatio(black, white)).toBeCloseTo(21);
  expect(colors.getContrastRatio({ r: 0, g: 120, b: 212 }, white)).toBeCloseTo(4.53, 2);
  expect(colors.getContrastingColor({ r: 0, g: 120, b: 212 })).toBe(colors.WHITE);
  expect(colors.getContrastingColor({ r: 118, g: 118, b: 118 })).toBe(colors.WHITE);
  expect(colors.getContrastingColor({ r: 119, g: 119, b: 119 })).toBe(colors.BLACK);
  for (let value = 0; value <= 255; value += 5) {
    [
      { r: value, g: value, b: value }, { r: value, g: 0, b: 0 },
      { r: 0, g: value, b: 0 }, { r: 0, g: 0, b: value }, { r: 255, g: value, b: 0 }
    ].forEach(color => {
      const contrast = colors.getContrastingColor(color) === colors.WHITE ? white : black;
      expect(colors.getContrastRatio(color, contrast)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

test('validates colors and rejects injection attempts', () => {
  ['#0078d4', 'rebeccapurple', 'rgb(1, 2, 3)'].forEach(value => {
    expect(colors.isValidCssColor(value)).toBe(true);
  });
  ['notacolor', 'red; background: url(x)'].forEach(value => {
    expect(colors.isValidCssColor(value)).toBe(false);
  });
});

test('resolves browser colors without leaving probe elements', () => {
  expect(colors.resolveCssColor('red')).toEqual({ r: 255, g: 0, b: 0 });
  expect(colors.resolveCssColor('#0078d4')).toEqual({ r: 0, g: 120, b: 212 });
  expect(document.body.childElementCount).toBe(0);
});

test('keeps theme defaults and respects both configured colors', () => {
  const defaults = { backgroundColor: undefined, textColor: undefined, warnings: [] };
  expect(colors.resolveBannerColors(undefined, undefined)).toEqual(defaults);
  expect(colors.resolveBannerColors('', '  ')).toEqual(defaults);
  expect(colors.resolveBannerColors(' #ff0000 ', 'white')).toEqual({
    backgroundColor: '#ff0000', textColor: 'white', warnings: []
  });
});

test('chooses contrasting foreground or background when only one is configured', () => {
  expect(colors.resolveBannerColors('#ffd700', '')).toEqual({
    backgroundColor: '#ffd700', textColor: colors.BLACK, warnings: []
  });
  expect(colors.resolveBannerColors('navy', undefined)).toEqual({
    backgroundColor: 'navy', textColor: colors.WHITE, warnings: []
  });
  expect(colors.resolveBannerColors('', '#ffffff')).toEqual({
    backgroundColor: colors.BLACK, textColor: '#ffffff', warnings: []
  });
  expect(colors.resolveBannerColors(undefined, 'black')).toEqual({
    backgroundColor: colors.WHITE, textColor: 'black', warnings: []
  });
});

test('logs invalid colors and non-string configuration through returned warnings', () => {
  expect(colors.resolveBannerColors('notacolor', 'blue')).toEqual({
    backgroundColor: colors.WHITE, textColor: 'blue',
    warnings: ['Ignoring invalid backgroundColor "notacolor".']
  });
  expect(colors.resolveBannerColors(42, undefined)).toEqual({
    backgroundColor: undefined, textColor: undefined,
    warnings: ['Ignoring backgroundColor because it is not a string.']
  });
});

test('reports an unresolvable contrast instead of silently hiding it', () => {
  jest.spyOn(window, 'getComputedStyle').mockReturnValue({ color: 'color(display-p3 1 0 0)' });
  const result = colors.resolveBannerColors('#ff0000', '');
  expect(result.backgroundColor).toBe('#ff0000');
  expect(result.textColor).toBeUndefined();
  expect(result.warnings).toHaveLength(1);
});
