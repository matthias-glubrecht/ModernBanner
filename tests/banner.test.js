'use strict';
const { LaufschriftBanner, SCROLL_SPEED_PX_PER_SECOND } = require('../lib/extensions/laufschrift/LaufschriftBanner');
const labels = { region: 'Announcement', pause: 'Pause', play: 'Play' };
let host;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete window.ResizeObserver;
  document.body.innerHTML = '';
});

function width(value) {
  return jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(value);
}

test('renders plain text in a labelled region with theme defaults and default font size', () => {
  const banner = new LaufschriftBanner(host, { text: '<b>Hello</b>', labels });
  const region = host.querySelector('[role="region"]');
  expect(region.getAttribute('aria-label')).toBe('Announcement');
  expect(region.textContent).toBe('<b>Hello</b>');
  expect(host.querySelector('b')).toBeNull();
  expect(region.style.backgroundColor).toBe('');
  expect(region.style.color).toBe('');
  expect(region.style.fontSize).toBe('14px');
  banner.dispose();
});

test('applies both colors and configured font size', () => {
  const banner = new LaufschriftBanner(host, {
    text: 'Hello', labels, backgroundColor: '#ffd700', textColor: '#000000', fontSize: 72
  });
  const region = host.querySelector('[role="region"]');
  expect(region.style.backgroundColor).toBe('rgb(255, 215, 0)');
  expect(region.style.color).toBe('rgb(0, 0, 0)');
  expect(region.style.fontSize).toBe('72px');
  banner.dispose();
});

test('toggles pause/play with a keyboard-operable native button and inline SVG', () => {
  const banner = new LaufschriftBanner(host, { text: 'Hello', labels });
  const button = host.querySelector('button');
  const region = host.querySelector('[role="region"]');
  expect(button.type).toBe('button');
  expect(button.getAttribute('aria-label')).toBe('Pause');
  expect(host.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  expect(banner.isPaused).toBe(false);
  button.click();
  expect(banner.isPaused).toBe(true);
  expect(button.getAttribute('aria-label')).toBe('Play');
  expect(button.title).toBe('Play');
  expect(region.classList.contains('paused')).toBe(true);
  button.click();
  expect(banner.isPaused).toBe(false);
  expect(button.getAttribute('aria-label')).toBe('Pause');
  expect(region.classList.contains('paused')).toBe(false);
  banner.dispose();
});

test('calculates 80px/s and updates duration with window resize fallback, then removes listener', () => {
  const spy = width(800);
  const banner = new LaufschriftBanner(host, { text: 'Hello', labels, fontSize: 72 });
  const track = host.querySelector('.track');
  expect(SCROLL_SPEED_PX_PER_SECOND).toBe(80);
  expect(track.style.animationDuration).toBe('10s');
  spy.mockReturnValue(2400);
  window.dispatchEvent(new Event('resize'));
  expect(track.style.animationDuration).toBe('30s');
  banner.dispose();
  spy.mockReturnValue(3200);
  window.dispatchEvent(new Event('resize'));
  expect(track.style.animationDuration).toBe('30s');
});

test('keeps CSS duration until measurable', () => {
  width(0);
  const banner = new LaufschriftBanner(host, { text: 'Hello', labels });
  expect(host.querySelector('.track').style.animationDuration).toBe('');
  banner.dispose();
});

test('observes changing text width and disconnects, ignoring late callbacks after disposal', () => {
  let observer;
  window.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.observe = jest.fn();
      this.disconnect = jest.fn();
      observer = this;
    }
  };
  const spy = width(1600);
  const banner = new LaufschriftBanner(host, { text: 'Hello', labels });
  const track = host.querySelector('.track');
  expect(observer.observe).toHaveBeenCalledWith(track);
  expect(track.style.animationDuration).toBe('20s');
  spy.mockReturnValue(3200);
  observer.callback();
  expect(track.style.animationDuration).toBe('40s');
  banner.dispose();
  expect(observer.disconnect).toHaveBeenCalledTimes(1);
  spy.mockReturnValue(6400);
  observer.callback();
  expect(track.style.animationDuration).toBe('40s');
});

test('disposes DOM and click listener idempotently', () => {
  const banner = new LaufschriftBanner(host, { text: 'Hello', labels });
  const button = host.querySelector('button');
  banner.dispose();
  banner.dispose();
  expect(host.childElementCount).toBe(0);
  button.click();
  expect(banner.isPaused).toBe(false);
});
