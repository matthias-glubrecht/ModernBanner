import styles from './LaufschriftBanner.module.scss';
import { DEFAULT_FONT_SIZE } from './bannerSettings';

export const SCROLL_SPEED_PX_PER_SECOND: number = 80;
const SVG_NAMESPACE: string = 'http://www.w3.org/2000/svg';
const PAUSE_ICON_PATH: string = 'M4 2h3v12H4zM9 2h3v12H9z';
const PLAY_ICON_PATH: string = 'M4 2l10 6-10 6z';

export interface ILaufschriftBannerLabels {
  region: string;
  pause: string;
  play: string;
}

export interface ILaufschriftBannerOptions {
  text: string;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  labels: ILaufschriftBannerLabels;
}

interface IBannerResizeObserver {
  observe(target: Element): void;
  disconnect(): void;
}

interface IBannerWindow extends Window {
  ResizeObserver?: new (callback: () => void) => IBannerResizeObserver;
}

export class LaufschriftBanner {
  private readonly _root: HTMLDivElement;
  private readonly _track: HTMLDivElement;
  private readonly _toggle: HTMLButtonElement;
  private readonly _toggleIcon: Element;
  private readonly _labels: ILaufschriftBannerLabels;
  private _resizeObserver: IBannerResizeObserver | undefined;
  private _isPaused: boolean = false;
  private _isDisposed: boolean = false;

  public constructor(host: HTMLElement, options: ILaufschriftBannerOptions) {
    this._labels = options.labels;
    this._root = document.createElement('div');
    this._root.className = styles.banner;
    this._root.setAttribute('role', 'region');
    this._root.setAttribute('aria-label', options.labels.region);
    this._root.style.fontSize = `${options.fontSize === undefined ? DEFAULT_FONT_SIZE : options.fontSize}px`;
    if (options.backgroundColor) {
      this._root.style.backgroundColor = options.backgroundColor;
    }
    if (options.textColor) {
      this._root.style.color = options.textColor;
    }
    const viewport: HTMLDivElement = document.createElement('div');
    viewport.className = styles.viewport;
    this._track = document.createElement('div');
    this._track.className = styles.track;
    const text: HTMLSpanElement = document.createElement('span');
    text.textContent = options.text;
    this._toggle = document.createElement('button');
    this._toggle.type = 'button';
    this._toggle.className = styles.toggle;
    this._toggle.addEventListener('click', this._onToggleClick);
    const icon: Element = document.createElementNS(SVG_NAMESPACE, 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    this._toggleIcon = document.createElementNS(SVG_NAMESPACE, 'path');
    icon.appendChild(this._toggleIcon);
    this._toggle.appendChild(icon);
    this._track.appendChild(text);
    viewport.appendChild(this._track);
    this._root.appendChild(viewport);
    this._root.appendChild(this._toggle);
    host.appendChild(this._root);
    this._updatePausedState();
    this._updateDuration();
    this._observeSize();
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._toggle.removeEventListener('click', this._onToggleClick);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    } else {
      window.removeEventListener('resize', this._updateDuration);
    }
    if (this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
  }

  private _onToggleClick: () => void = (): void => {
    this._isPaused = !this._isPaused;
    this._updatePausedState();
  }

  private _updatePausedState(): void {
    const label: string = this._isPaused ? this._labels.play : this._labels.pause;
    this._toggle.setAttribute('aria-label', label);
    this._toggle.title = label;
    this._toggleIcon.setAttribute('d', this._isPaused ? PLAY_ICON_PATH : PAUSE_ICON_PATH);
    if (this._isPaused) {
      this._root.classList.add(styles.paused);
    } else {
      this._root.classList.remove(styles.paused);
    }
  }

  // Padding plus text width is exactly the distance travelled in one animation cycle.
  private _updateDuration: () => void = (): void => {
    if (this._isDisposed) {
      return;
    }
    const distance: number = this._track.offsetWidth;
    if (distance > 0) {
      this._track.style.animationDuration = `${distance / SCROLL_SPEED_PX_PER_SECOND}s`;
    }
  }

  private _observeSize(): void {
    const browser: IBannerWindow = window;
    if (browser.ResizeObserver) {
      this._resizeObserver = new browser.ResizeObserver(this._updateDuration);
      this._resizeObserver.observe(this._track);
    } else {
      window.addEventListener('resize', this._updateDuration);
    }
  }
}
