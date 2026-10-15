'use strict';
const { resolveFontSize } = require('../lib/extensions/laufschrift/bannerSettings');
const { resolvePageFilter, matchesPage } = require('../lib/extensions/laufschrift/pageFilter');

describe('font size', () => {
  test('preserves the default and accepts both boundaries and fractional sizes', () => {
    expect(resolveFontSize(undefined)).toEqual({ fontSize: 14, warnings: [] });
    [10, 14, 18, 24.5, 72].forEach(value => {
      expect(resolveFontSize(value)).toEqual({ fontSize: value, warnings: [] });
    });
  });

  test('reports invalid values and uses 14px without clamping', () => {
    [null, '', '18', '18px', true, {}, [], NaN, Infinity, -Infinity, 9.9, 72.1].forEach(value => {
      const result = resolveFontSize(value);
      expect(result.fontSize).toBe(14);
      expect(result.warnings).toHaveLength(1);
    });
  });
});

describe('page-name filtering', () => {
  const filter = resolvePageFilter([' Interviewmaske2 ', 'Interview M\u00e4rz']);
  const match = (path, web = '/sites/Otto') => matchesPage(filter, path, web);

  test('omitted and empty filters do not restrict pages', () => {
    [undefined, []].forEach(value => {
      expect(matchesPage(resolvePageFilter(value), '/Lists/Tasks/AllItems.aspx', '/').matches).toBe(true);
    });
  });

  test('matches exact filename stems in SitePages, ignoring case, query and fragment', () => {
    [
      '/sites/Otto/SitePages/Interviewmaske2.aspx',
      '/sites/otto/sitepages/INTERVIEWMASKE2.ASPX?Mode=Edit#section',
      '/sites/Otto/SitePages/folder/Interviewmaske2.aspx',
      '/sites/Otto/SitePages/Interview%20M%C3%A4rz.aspx'
    ].forEach(path => expect(match(path)).toEqual({ matches: true, warnings: [] }));
  });

  test('works for root webs and subwebs with the same filename', () => {
    expect(match('/SitePages/Interviewmaske2.aspx', '/').matches).toBe(true);
    expect(match('/sites/Otto/Sub/SitePages/Interviewmaske2.aspx', '/sites/Otto/Sub').matches).toBe(true);
    expect(match('/sites/Other/SitePages/Interviewmaske2.aspx', '/sites/Other').matches).toBe(true);
  });

  test('rejects partial names, non-SitePages paths, wrong webs and extensions', () => {
    [
      '/sites/Otto/SitePages/Interviewmaske20.aspx',
      '/sites/Otto/SitePages/Interviewmaske2.html',
      '/sites/Otto/SitePages/Interviewmaske2',
      '/sites/Otto/Pages/Interviewmaske2.aspx',
      '/sites/Otto/SitePagesOther/Interviewmaske2.aspx',
      '/sites/Otto/Sub/SitePages/Interviewmaske2.aspx',
      '/sites/Other/SitePages/Interviewmaske2.aspx',
      '/sites/Otto/',
      '/sites/Otto/SitePages/Other.aspx?Title=Interviewmaske2'
    ].forEach(path => expect(match(path).matches).toBe(false));
  });

  test('does not broaden visibility for malformed configuration', () => {
    [null, 'Interviewmaske2', {}, [42], [''], ['  '], ['Home.aspx'], ['/Home'],
      ['a\\b'], ['a?b'], ['a#b'], ['Home*'], ['Home', null]].forEach(value => {
      const invalid = resolvePageFilter(value);
      expect(invalid.isValid).toBe(false);
      expect(invalid.warnings).toHaveLength(1);
      expect(matchesPage(invalid, '/sites/Otto/SitePages/Home.aspx', '/sites/Otto').matches).toBe(false);
    });
  });

  test('decodes once and reports invalid encoding or encoded path separators', () => {
    ['/sites/Otto/SitePages/Interview%ZZ.aspx', '/sites/Otto/SitePages/a%2fb.aspx',
      '/sites/Otto/SitePages/a%5cb.aspx'].forEach(path => {
      expect(match(path).matches).toBe(false);
      expect(match(path).warnings).toHaveLength(1);
    });
    expect(matchesPage(resolvePageFilter(['a%20b']), '/SitePages/a%2520b.aspx', '/').matches).toBe(true);
    expect(matchesPage(resolvePageFilter(['a b']), '/SitePages/a%2520b.aspx', '/').matches).toBe(false);
  });
});
