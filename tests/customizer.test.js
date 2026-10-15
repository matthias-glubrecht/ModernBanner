'use strict';
jest.mock('@microsoft/sp-core-library', () => ({
  Log: { info: jest.fn(), warn: jest.fn() }
}));
jest.mock('@microsoft/sp-application-base', () => ({
  BaseApplicationCustomizer: function () {},
  PlaceholderName: { Top: 'Top' }
}));
const appBase = require('@microsoft/sp-application-base');
appBase.BaseApplicationCustomizer.prototype.onDispose = jest.fn();
const { Log } = require('@microsoft/sp-core-library');
const Customizer = require('../lib/extensions/laufschrift/LaufschriftApplicationCustomizer').default;

function event() {
  const handlers = [];
  return {
    add: jest.fn((scope, handler) => handlers.push({ scope, handler })),
    remove: jest.fn((scope, handler) => {
      const index = handlers.findIndex(item => item.scope === scope && item.handler === handler);
      if (index >= 0) handlers.splice(index, 1);
    }),
    fire: () => handlers.slice().forEach(item => item.handler.call(item.scope))
  };
}

function setup(properties) {
  const placeholders = [];
  const changedEvent = event();
  const navigatedEvent = event();
  const provider = {
    changedEvent,
    tryCreateContent: jest.fn((name, options) => {
      const domElement = document.createElement('div');
      document.body.appendChild(domElement);
      const placeholder = {
        domElement,
        dispose: jest.fn(() => {
          options.onDispose();
          if (domElement.parentNode) domElement.parentNode.removeChild(domElement);
        })
      };
      placeholders.push(placeholder);
      return placeholder;
    })
  };
  const customizer = new Customizer();
  customizer.properties = properties;
  customizer.context = {
    placeholderProvider: provider,
    application: { navigatedEvent },
    pageContext: { web: { serverRelativeUrl: '/sites/Otto' } }
  };
  return { customizer, provider, placeholders, changedEvent, navigatedEvent };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/sites/Otto/SitePages/Interviewmaske2.aspx');
  jest.clearAllMocks();
});
afterEach(() => {
  document.body.innerHTML = '';
});

test('does not register or remove unregistered events with empty text', async () => {
  const { customizer, provider, navigatedEvent } = setup({ bannerText: '  ' });
  await customizer.onInit();
  expect(provider.changedEvent.add).not.toHaveBeenCalled();
  expect(navigatedEvent.add).not.toHaveBeenCalled();
  customizer.onDispose();
  expect(provider.changedEvent.remove).not.toHaveBeenCalled();
  expect(navigatedEvent.remove).not.toHaveBeenCalled();
});

test('passes text, colors, font and localized labels to the banner', async () => {
  const { customizer } = setup({
    bannerText: ' Hello ', backgroundColor: '#ffd700', textColor: 'black',
    fontSize: 18, includedPageNames: ['Interviewmaske2']
  });
  await customizer.onInit();
  const region = document.querySelector('[role="region"]');
  expect(region.textContent).toBe('Hello');
  expect(region.style.backgroundColor).toBe('rgb(255, 215, 0)');
  expect(region.style.color).toBe('black');
  expect(region.style.fontSize).toBe('18px');
  expect(region.getAttribute('aria-label')).toBe('Announcement');
  customizer.onDispose();
});

test('retries when Top becomes available and avoids duplicate banners', async () => {
  const { customizer, provider, changedEvent } = setup({ bannerText: 'Hello' });
  provider.tryCreateContent.mockReturnValueOnce(undefined);
  await customizer.onInit();
  expect(document.querySelector('[role="region"]')).toBeNull();
  changedEvent.fire();
  changedEvent.fire();
  expect(document.querySelectorAll('[role="region"]')).toHaveLength(1);
  expect(provider.tryCreateContent).toHaveBeenCalledTimes(2);
  customizer.onDispose();
});

test('recreates disposed placeholders and unregisters both events on disposal', async () => {
  const { customizer, placeholders, changedEvent, navigatedEvent, provider } = setup({ bannerText: 'Hello' });
  await customizer.onInit();
  placeholders[0].dispose();
  expect(document.querySelector('[role="region"]')).toBeNull();
  changedEvent.fire();
  expect(document.querySelectorAll('[role="region"]')).toHaveLength(1);
  customizer.onDispose();
  expect(placeholders[1].dispose).toHaveBeenCalledTimes(1);
  expect(changedEvent.remove).toHaveBeenCalledTimes(1);
  expect(navigatedEvent.remove).toHaveBeenCalledTimes(1);
  changedEvent.fire();
  navigatedEvent.fire();
  expect(provider.tryCreateContent).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="region"]')).toBeNull();
});

test('shows and hides on in-place navigation without relying on placeholder changes', async () => {
  const { customizer, navigatedEvent, placeholders, changedEvent } = setup({
    bannerText: 'Hello', includedPageNames: ['Interviewmaske2']
  });
  await customizer.onInit();
  expect(document.querySelector('[role="region"]')).not.toBeNull();
  window.history.pushState({}, '', '/sites/Otto/SitePages/Other.aspx');
  navigatedEvent.fire();
  expect(document.querySelector('[role="region"]')).toBeNull();
  expect(placeholders[0].dispose).toHaveBeenCalledTimes(1);
  changedEvent.fire();
  expect(document.querySelector('[role="region"]')).toBeNull();
  window.history.pushState({}, '', '/sites/Otto/SitePages/folder/Interviewmaske2.aspx');
  navigatedEvent.fire();
  expect(document.querySelectorAll('[role="region"]')).toHaveLength(1);
  customizer.onDispose();
});

test('can navigate from an initially excluded page to an included page in another web', async () => {
  window.history.replaceState({}, '', '/sites/Otto/Lists/Tasks/AllItems.aspx');
  const { customizer, navigatedEvent } = setup({
    bannerText: 'Hello', includedPageNames: ['Interviewmaske2']
  });
  await customizer.onInit();
  expect(document.querySelector('[role="region"]')).toBeNull();
  window.history.pushState({}, '', '/sites/Otto/Sub/SitePages/Interviewmaske2.aspx');
  customizer.context.pageContext.web.serverRelativeUrl = '/sites/Otto/Sub';
  navigatedEvent.fire();
  expect(document.querySelector('[role="region"]')).not.toBeNull();
  customizer.onDispose();
});

test('invalid filter hides banner and logs warnings; invalid colors and font also warn', async () => {
  const { customizer, provider } = setup({
    bannerText: 'Hello', includedPageNames: ['Home.aspx'],
    backgroundColor: 'notacolor', fontSize: '18px'
  });
  await customizer.onInit();
  expect(Log.warn).toHaveBeenCalledTimes(3);
  expect(provider.changedEvent.add).not.toHaveBeenCalled();
  expect(provider.tryCreateContent).not.toHaveBeenCalled();
  customizer.onDispose();
});
