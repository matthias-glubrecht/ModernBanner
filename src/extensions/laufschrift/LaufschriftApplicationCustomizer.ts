import { Log } from '@microsoft/sp-core-library';
import { BaseApplicationCustomizer, PlaceholderContent, PlaceholderName } from '@microsoft/sp-application-base';
import * as strings from 'LaufschriftApplicationCustomizerStrings';
import { IBannerColors, resolveBannerColors } from './colorUtils';
import { IFontSizeResult, resolveFontSize } from './bannerSettings';
import { IPageFilter, IPageMatch, matchesPage, resolvePageFilter } from './pageFilter';
import { LaufschriftBanner } from './LaufschriftBanner';

const LOG_SOURCE: string = 'LaufschriftApplicationCustomizer';

export interface ILaufschriftApplicationCustomizerProperties {
  bannerText: string;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  includedPageNames?: string[];
}

export default class LaufschriftApplicationCustomizer
  extends BaseApplicationCustomizer<ILaufschriftApplicationCustomizerProperties> {

  private _bannerText: string = '';
  private _colors: IBannerColors;
  private _fontSize: number;
  private _filter: IPageFilter;
  private _topPlaceholder: PlaceholderContent | undefined;
  private _banner: LaufschriftBanner | undefined;
  private _eventsRegistered: boolean = false;
  private _isExtensionDisposed: boolean = false;

  public onInit(): Promise<void> {
    Log.info(LOG_SOURCE, `Initialized ${strings.Title}`);
    const properties: Partial<ILaufschriftApplicationCustomizerProperties> = this.properties || {};
    this._bannerText = typeof properties.bannerText === 'string' ? properties.bannerText.trim() : '';
    if (!this._bannerText) {
      Log.info(LOG_SOURCE, 'No bannerText configured, nothing to render.');
      return Promise.resolve();
    }
    this._colors = resolveBannerColors(properties.backgroundColor, properties.textColor);
    const font: IFontSizeResult = resolveFontSize(properties.fontSize);
    this._fontSize = font.fontSize;
    this._filter = resolvePageFilter(properties.includedPageNames);
    this._colors.warnings.concat(font.warnings, this._filter.warnings)
      .forEach((warning: string): void => Log.warn(LOG_SOURCE, warning));
    if (!this._filter.isValid) {
      return Promise.resolve();
    }
    this.context.placeholderProvider.changedEvent.add(this, this._renderPlaceholder);
    this.context.application.navigatedEvent.add(this, this._renderPlaceholder);
    this._eventsRegistered = true;
    this._renderPlaceholder();
    return Promise.resolve();
  }

  protected onDispose(): void {
    this._isExtensionDisposed = true;
    if (this._eventsRegistered) {
      this.context.placeholderProvider.changedEvent.remove(this, this._renderPlaceholder);
      this.context.application.navigatedEvent.remove(this, this._renderPlaceholder);
      this._eventsRegistered = false;
    }
    this._disposePlaceholder();
    super.onDispose();
  }

  private _renderPlaceholder: () => void = (): void => {
    if (this._isExtensionDisposed || !this._bannerText || !this._filter) {
      return;
    }
    const match: IPageMatch = matchesPage(
      this._filter, window.location.pathname, this.context.pageContext.web.serverRelativeUrl);
    match.warnings.forEach((warning: string): void => Log.warn(LOG_SOURCE, warning));
    if (!match.matches) {
      this._disposePlaceholder();
      return;
    }
    if (this._topPlaceholder) {
      return;
    }
    this._topPlaceholder = this.context.placeholderProvider.tryCreateContent(PlaceholderName.Top, {
      onDispose: this._onPlaceholderDispose
    });
    if (!this._topPlaceholder) {
      Log.info(LOG_SOURCE, 'The Top placeholder is not available on this page.');
      return;
    }
    this._disposeBanner();
    this._banner = new LaufschriftBanner(this._topPlaceholder.domElement, {
      text: this._bannerText,
      backgroundColor: this._colors.backgroundColor,
      textColor: this._colors.textColor,
      fontSize: this._fontSize,
      labels: { region: strings.BannerAriaLabel, pause: strings.PauseButtonLabel, play: strings.PlayButtonLabel }
    });
  }

  private _onPlaceholderDispose: () => void = (): void => {
    this._disposeBanner();
    this._topPlaceholder = undefined;
  }

  private _disposePlaceholder(): void {
    const placeholder: PlaceholderContent | undefined = this._topPlaceholder;
    this._topPlaceholder = undefined;
    this._disposeBanner();
    if (placeholder) {
      placeholder.dispose();
    }
  }

  private _disposeBanner(): void {
    if (this._banner) {
      this._banner.dispose();
      this._banner = undefined;
    }
  }
}
