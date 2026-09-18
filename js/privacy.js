/* Google CMP integration: optional Analytics fails closed until a usable signal.
 * https://developers.google.com/funding-choices/fc-api-docs
 * This is not a CMP: Google's published message owns consent collection.
 */
(function () {
  'use strict';
  var measurementId = 'G-WKLJQZBWD1';
  var loaded = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window['ga-disable-' + measurementId] = true;
  window.gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied',
    ad_personalization: 'denied', analytics_storage: 'denied'
  });
  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];

  function syncAnalytics() {
    var fc = window.googlefc;
    var allowed = false;
    try {
      var status = fc.getGoogleConsentModeValues().analyticsStoragePurposeConsentStatus;
      var values = fc.ConsentModePurposeStatusEnum;
      allowed = status !== undefined && (
        status === values.CONSENT_MODE_PURPOSE_STATUS_GRANTED ||
        status === values.CONSENT_MODE_PURPOSE_STATUS_NOT_APPLICABLE);
    } catch (_) { /* Missing or failed CMP must not start analytics. */ }
    window['ga-disable-' + measurementId] = !allowed;
    window.gtag('consent', 'update', { analytics_storage: allowed ? 'granted' : 'denied' });
    if (!allowed || loaded) return;
    loaded = true;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);
  }

  window.googlefc.callbackQueue.push({ CONSENT_MODE_DATA_READY: syncAnalytics });
  window.googlefc.callbackQueue.push({ CONSENT_API_READY: function () {
    if (typeof window.__tcfapi === 'function') {
      window.__tcfapi('addEventListener', 2, function (data, success) {
        if (success && (data.eventStatus === 'tcloaded' || data.eventStatus === 'useractioncomplete')) {
          syncAnalytics();
        }
      });
    }
  } });

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-privacy-settings]');
    if (!button) return;
    var status = button.parentNode.querySelector('[data-privacy-status]');
    if (typeof window.googlefc.showRevocationMessage !== 'function') {
      if (status) status.textContent = 'Privacy choices are unavailable. Optional analytics remains off unless a valid consent signal has already been received.';
      return;
    }
    window.googlefc.callbackQueue.push(function () {
      window.googlefc.showRevocationMessage();
    });
    if (status) status.textContent = '';
  });
}());
