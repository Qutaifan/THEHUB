const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../js/privacy.js'), 'utf8');

function setup() {
  const scripts = [];
  const listeners = {};
  const window = {};
  const document = {
    createElement: () => ({}),
    head: { appendChild: node => scripts.push(node) },
    addEventListener: (event, fn) => { listeners[event] = fn; }
  };
  vm.runInNewContext(source, { window, document });
  return { window, scripts, listeners };
}
const enumValues = {
  CONSENT_MODE_PURPOSE_STATUS_UNKNOWN: 0,
  CONSENT_MODE_PURPOSE_STATUS_GRANTED: 1,
  CONSENT_MODE_PURPOSE_STATUS_DENIED: 2,
  CONSENT_MODE_PURPOSE_STATUS_NOT_APPLICABLE: 3,
  CONSENT_MODE_PURPOSE_STATUS_NOT_CONFIGURED: 4
};

test('no CMP means no Analytics loader and denied defaults', () => {
  const { window, scripts } = setup();
  assert.equal(scripts.length, 0);
  assert.equal(window['ga-disable-G-WKLJQZBWD1'], true);
  assert.equal(window.dataLayer[0][2].analytics_storage, 'denied');
  window.googlefc.callbackQueue[0].CONSENT_MODE_DATA_READY();
  assert.equal(scripts.length, 0);
});

for (const [name, status] of Object.entries(enumValues)) {
  test(name, () => {
    const { window, scripts } = setup();
    const fc = window.googlefc;
    fc.ConsentModePurposeStatusEnum = enumValues;
    fc.getGoogleConsentModeValues = () => ({ analyticsStoragePurposeConsentStatus: status });
    const sync = fc.callbackQueue[0].CONSENT_MODE_DATA_READY;
    sync(); sync();
    const allowed = status === 1 || status === 3;
    assert.equal(scripts.length, allowed ? 1 : 0);
    assert.equal(window['ga-disable-G-WKLJQZBWD1'], !allowed);
  });
}

test('withdrawal disables an already loaded Analytics tag', () => {
  const { window, scripts } = setup();
  const fc = window.googlefc;
  let status = 1;
  fc.ConsentModePurposeStatusEnum = enumValues;
  fc.getGoogleConsentModeValues = () => ({ analyticsStoragePurposeConsentStatus: status });
  let consentListener;
  window.__tcfapi = (method, version, fn) => { consentListener = fn; };
  fc.callbackQueue[1].CONSENT_API_READY();
  fc.callbackQueue[0].CONSENT_MODE_DATA_READY();
  status = 2;
  consentListener({ eventStatus: 'useractioncomplete' }, true);
  assert.equal(scripts.length, 1);
  assert.equal(window['ga-disable-G-WKLJQZBWD1'], true);
  assert.equal(window.dataLayer.at(-1)[2].analytics_storage, 'denied');
});

test('privacy button reports unavailable service without granting consent', () => {
  const { listeners, scripts } = setup();
  const status = {};
  listeners.click({ target: { closest: () => ({ parentNode: { querySelector: () => status } }) } });
  assert.match(status.textContent, /unavailable/);
  assert.equal(scripts.length, 0);
});
