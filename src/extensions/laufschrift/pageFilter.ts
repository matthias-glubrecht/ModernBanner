import { ConfigurationValue } from './bannerSettings';

export interface IPageFilter {
  names: string[];
  isValid: boolean;
  warnings: string[];
}

export interface IPageMatch {
  matches: boolean;
  warnings: string[];
}

export function resolvePageFilter(value: ConfigurationValue): IPageFilter {
  if (value === undefined) {
    return { names: [], isValid: true, warnings: [] };
  }
  const names: string[] = [];
  if (Array.isArray(value)) {
    for (let i: number = 0; i < value.length; i++) {
      const entry: ConfigurationValue = value[i];
      if (typeof entry !== 'string' || !entry.trim() ||
          /[\/\\?#*]/.test(entry) || /\.aspx$/i.test(entry.trim())) {
        return invalidFilter();
      }
      names.push(entry.trim().toLowerCase());
    }
    return { names: names, isValid: true, warnings: [] };
  }
  return invalidFilter();
}

function invalidFilter(): IPageFilter {
  return {
    names: [],
    isValid: false,
    warnings: ['Invalid includedPageNames; expected an array of page names without .aspx, paths or wildcards. Banner hidden.']
  };
}

function pathSegments(path: string): string[] {
  const clean: string = path.split(/[?#]/)[0].replace(/\/+$/, '');
  return clean.split('/').map((segment: string): string => {
    const decoded: string = decodeURIComponent(segment);
    if (/[\/\\]/.test(decoded)) {
      throw new URIError('Encoded path separators are not allowed.');
    }
    return decoded.toLowerCase();
  });
}

export function matchesPage(filter: IPageFilter, pathname: string, webRelativeUrl: string): IPageMatch {
  if (!filter.isValid) {
    return { matches: false, warnings: [] };
  }
  if (!filter.names.length) {
    return { matches: true, warnings: [] };
  }
  let page: string[];
  let web: string[];
  try {
    page = pathSegments(pathname);
    web = pathSegments(webRelativeUrl);
  } catch (error) {
    if (!(error instanceof URIError)) {
      throw error;
    }
    return { matches: false, warnings: ['Cannot match includedPageNames against an invalid URL path. Banner hidden.'] };
  }
  if (page.length < web.length + 2 || page[web.length] !== 'sitepages') {
    return { matches: false, warnings: [] };
  }
  for (let i: number = 0; i < web.length; i++) {
    if (page[i] !== web[i]) {
      return { matches: false, warnings: [] };
    }
  }
  const filename: string = page[page.length - 1];
  const stem: string = filename.replace(/\.aspx$/i, '');
  return {
    matches: /\.aspx$/i.test(filename) && filter.names.indexOf(stem) !== -1,
    warnings: []
  };
}
