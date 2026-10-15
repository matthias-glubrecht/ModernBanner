'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const url = require('url');
const http = require('http');
const net = require('net');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const lib = path.join(root, 'lib', 'extensions', 'laufschrift');
const browsers = [
  { name: 'Edge', paths: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ] },
  { name: 'Chrome', paths: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ] }
];
const sources = {};
['bannerSettings', 'colorUtils', 'LaufschriftBanner', 'LaufschriftBanner.module.scss'].forEach(name => {
  sources[name] = fs.readFileSync(path.join(lib, name + '.js'), 'utf8');
});
const css = fs.readFileSync(path.join(lib, 'LaufschriftBanner.module.css'), 'utf8')
  .replace(/"\[theme: themePrimary, default: #0078d4\]"/g, '#0078d4')
  .replace(/"\[theme: white, default: #ffffff\]"/g, '#ffffff');

function browserChecks(sources, reduced) {
  const results = [];
  function check(condition, message) {
    if (!condition) throw new Error(message);
    results.push(message);
  }
  const cache = {};
  function load(name) {
    name = name.replace(/^\.\//, '');
    if (/\.css$/.test(name)) return {};
    if (!cache[name]) {
      const module = { exports: {} };
      cache[name] = module;
      new Function('require', 'exports', 'module', sources[name])(load, module.exports, module);
    }
    return cache[name].exports;
  }
  function finish(error) {
    document.getElementById('results').textContent = JSON.stringify({
      passed: !error, checks: results, error: error ? String(error.stack || error) : null
    });
  }
  try {
    const colors = load('colorUtils');
    check(colors.resolveCssColor('navy').b === 128, 'Native named-color normalization');
    check(colors.resolveBannerColors('#ffd700', '').textColor === '#000000', 'Automatic color contrast');
    check(colors.resolveBannerColors('', 'blue').backgroundColor === '#ffffff', 'Automatic background contrast');
    const Banner = load('LaufschriftBanner').LaufschriftBanner;
    const styles = load('LaufschriftBanner.module.scss').default;
    const host = document.createElement('div');
    host.style.width = '400px';
    document.body.appendChild(host);
    const labels = { region: 'Announcement', pause: 'Pause', play: 'Play' };
    [10, 14, 18, 72].forEach(fontSize => {
      const banner = new Banner(host, {
        text: '<b>Interviewmaske2</b> - a long announcement with spaces and readable text',
        labels, fontSize
      });
      const region = host.querySelector('[role="region"]');
      const track = host.querySelector('.' + styles.track);
      const viewport = host.querySelector('.' + styles.viewport);
      const button = host.querySelector('button');
      check(getComputedStyle(region).fontSize === fontSize + 'px', 'Font size ' + fontSize);
      check(!host.querySelector('b'), 'Plain text at ' + fontSize);
      check(region.getBoundingClientRect().height >= track.getBoundingClientRect().height,
        'No vertical clipping at ' + fontSize);
      check(viewport.scrollHeight <= viewport.clientHeight + 1, 'Text fits viewport at ' + fontSize);
      if (reduced) {
        check(getComputedStyle(track).animationName === 'none', 'Reduced-motion animation disabled at ' + fontSize);
        check(getComputedStyle(button).display === 'none', 'Reduced-motion button hidden at ' + fontSize);
        check(getComputedStyle(track).whiteSpace === 'normal', 'Reduced-motion text wraps at ' + fontSize);
      } else {
        check(Math.abs(track.offsetWidth / parseFloat(track.style.animationDuration) - 80) < 0.001,
          '80px/s at ' + fontSize);
        button.focus();
        check(document.activeElement === button, 'Button focusable at ' + fontSize);
        button.click();
        check(getComputedStyle(track).animationPlayState === 'paused', 'Pause at ' + fontSize);
        button.click();
        check(getComputedStyle(track).animationPlayState === 'running', 'Resume at ' + fontSize);
      }
      banner.dispose();
    });
    const banner = new Banner(host, { text: 'Resize observer check', labels, fontSize: 72 });
    const track = host.querySelector('.' + styles.track);
    host.style.width = '900px';
    setTimeout(() => {
      try {
        if (!reduced) {
          check(Math.abs(track.offsetWidth / parseFloat(track.style.animationDuration) - 80) < 0.001,
            'ResizeObserver recalculates speed after container resize');
        }
        banner.dispose();
        check(host.childElementCount === 0, 'Disposal removes banner');
        finish();
      } catch (error) { finish(error); }
    }, 300);
  } catch (error) { finish(error); }
}

function removeOwnedDirectory(directory) {
  fs.readdirSync(directory).forEach(name => {
    const entry = path.join(directory, name);
    if (fs.lstatSync(entry).isDirectory()) removeOwnedDirectory(entry);
    else fs.unlinkSync(entry);
  });
  fs.rmdirSync(directory);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getJson(port, endpoint) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: endpoint }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        try {
          assert.strictEqual(response.statusCode, 200, text);
          resolve(JSON.parse(text));
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(3000, () => {
      const error = new Error('Debugging endpoint timed out');
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    });
    request.on('error', reject);
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function connect(address) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(address, { handshakeTimeout: 10000 });
    let id = 0;
    const pending = new Map();
    socket.on('error', error => {
      reject(error);
      pending.forEach(item => item.reject(error));
    });
    socket.on('message', data => {
      const message = JSON.parse(data);
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    });
    socket.on('close', () => {
      pending.forEach(item => {
        clearTimeout(item.timeout);
        item.reject(new Error('Browser debugging connection closed'));
      });
      pending.clear();
    });
    socket.on('open', () => resolve({
      send(method, params) {
        return new Promise((done, fail) => {
          const requestId = ++id;
          const timeout = setTimeout(() => {
            pending.delete(requestId);
            fail(new Error('Browser command timed out: ' + method));
          }, 10000);
          pending.set(requestId, { resolve: done, reject: fail, timeout });
          socket.send(JSON.stringify({ id: requestId, method, params: params || {} }));
        });
      },
      close() { socket.close(); }
    }));
  });
}

async function runBrowser(browser, reduced) {
  const executable = browser.paths.find(candidate => fs.existsSync(candidate));
  assert(executable, browser.name + ' is required for this smoke test');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'modern-banner-browser-'));
    const fixture = path.join(directory, 'smoke.html');
    const payload = JSON.stringify(sources).replace(/</g, '\\u003c');
    const html = '<!doctype html><meta charset="utf-8"><style>' + css +
      '</style><pre id="results">PENDING</pre><script>(' + browserChecks.toString() +
      ')(' + payload + ',' + reduced + ');</script>';
    fs.writeFileSync(fixture, html);
    const port = await freePort();
    const args = [
      '--headless', '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--disable-features=msImplicitSignin',
      '--no-default-browser-check', '--user-data-dir=' + path.join(directory, 'profile'),
      '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port
    ];
    if (reduced) args.push('--force-prefers-reduced-motion=reduce');
    args.push(url.pathToFileURL ? url.pathToFileURL(fixture).href : url.format({
      protocol: 'file:', slashes: true, pathname: fixture.replace(/\\/g, '/')
    }));
    const child = childProcess.spawn(executable, args, { stdio: 'ignore' });
    let launchError;
    child.on('error', error => { launchError = error; });
    let connection;
    let browserConnection;
    try {
      let version;
      let startupError;
      for (let attempt = 0; attempt < 150 && !version; attempt++) {
        if (launchError) throw launchError;
        try { version = await getJson(port, '/json/version'); }
        catch (error) {
          if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].indexOf(error.code) === -1) throw error;
          startupError = error;
          await delay(100);
        }
      }
      assert(version, browser.name + ' did not start: ' + String(startupError));
      browserConnection = await connect(version.webSocketDebuggerUrl);
      const pages = await getJson(port, '/json/list');
      const page = pages.find(item => item.type === 'page' && item.url.indexOf('smoke.html') !== -1);
      assert(page, 'Browser has no page target');
      connection = await connect(page.webSocketDebuggerUrl);
      let text;
      for (let attempt = 0; attempt < 150; attempt++) {
        const evaluated = await connection.send('Runtime.evaluate', {
          expression: 'document.getElementById("results") && document.getElementById("results").textContent',
          returnByValue: true
        });
        assert(!evaluated.exceptionDetails, JSON.stringify(evaluated.exceptionDetails));
        text = evaluated.result.value;
        if (text && text !== 'PENDING') break;
        await delay(100);
      }
      assert(text && text !== 'PENDING', 'Browser checks did not finish');
      const report = JSON.parse(text);
      assert(report.passed, report.error);
      console.log(browser.name + (reduced ? ' reduced-motion' : ' standard') + ': ' + report.checks.length + ' checks passed');
    } catch (error) {
      console.error(browser.name + ' test failed (debug port ' + port + '): ' + String(error.stack || error));
      throw error;
    } finally {
      if (connection) connection.close();
      if (browserConnection) {
        await browserConnection.send('Browser.close');
        browserConnection.close();
      } else if (child.exitCode === null && child.pid) {
        child.kill();
      }
      for (let attempt = 0; attempt < 20; attempt++) {
        await delay(500);
        try {
          removeOwnedDirectory(directory);
          break;
        } catch (error) {
          if ((error.code !== 'EBUSY' && error.code !== 'EPERM' && error.code !== 'ENOTEMPTY') || attempt === 19) throw error;
        }
      }
    }
}

async function main() {
  const selected = browsers.filter(browser =>
    !process.argv[2] || browser.name.toLowerCase() === process.argv[2].toLowerCase());
  assert(selected.length, 'Expected browser name Edge or Chrome');
  for (const browser of selected) {
    await runBrowser(browser, false);
    await runBrowser(browser, true);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
