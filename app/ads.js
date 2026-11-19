import { Capacitor } from '@capacitor/core';

const demo = {
  android: 'ca-app-pub-3940256099942544/6300978111',
  ios: 'ca-app-pub-3940256099942544/2934735716',
};

function configuredUnit(platform) {
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') return demo[platform];
  const unit = platform === 'android' ? import.meta.env.VITE_ADMOB_ANDROID_BANNER_ID : import.meta.env.VITE_ADMOB_IOS_BANNER_ID;
  return /^ca-app-pub-\d{16}\/\d{10}$/.test(unit) && !unit.startsWith('ca-app-pub-3940256099942544/') ? unit : null;
}

// Call once after the calendar and its edit sheet are mounted.
export async function initAds(root) {
  const platform = Capacitor.getPlatform();
  if (!Capacitor.isNativePlatform() || !demo[platform]) return;
  const adId = configuredUnit(platform);
  if (!adId) return;
  const sheet = root.querySelector('#jsheet');
  const calendar = root.querySelector('main');
  if (!sheet || !calendar) return;

  const { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } = await import('@capacitor-community/admob');
  const style = document.createElement('style');
  style.textContent = `
    html.has-temperature-banner{overflow:hidden}
    html.has-temperature-banner body{position:fixed;inset:0 0 calc(var(--temperature-ad-inset) + env(safe-area-inset-bottom,0px));width:100%;height:auto;min-height:0;overflow:auto}
  `;
  document.head.append(style);
  let canShow = false, nativeBanner = false, privacyOpen = false, desired = false, initialized = false;
  let queue = Promise.resolve();
  function reserve(height) {
    const page = document.documentElement;
    page.style.setProperty('--temperature-ad-inset', height > 0 ? Math.ceil(height) + 'px' : '0px');
    page.classList.toggle('has-temperature-banner', height > 0);
  }
  function visible() {
    return canShow && !privacyOpen && !document.hidden && root.dataset.screen === 'calendar' && sheet.hidden
      && !document.activeElement?.matches('input:not([type=checkbox]),textarea,select');
  }
  function update() {
    if (desired === visible()) return;
    desired = !desired;
    queue = queue.then(async () => {
      if (visible() === nativeBanner) return;
      if (visible()) {
        if (!initialized) { await AdMob.initialize(); initialized = true; }
        if (!visible()) return;
        // A 320×50 logical-pixel banner lets us reserve its area before the native overlay appears.
        reserve(50);
        nativeBanner = true;
        await AdMob.showBanner({ adId, adSize: BannerAdSize.BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 0, npa: true });
      } else {
        await AdMob.removeBanner();
        nativeBanner = false;
        reserve(0);
      }
    }).catch(async () => {
      if (nativeBanner) await AdMob.removeBanner().catch(() => {});
      nativeBanner = false;
      reserve(0);
    });
  }

  const privacy = document.createElement('button');
  privacy.type = 'button';
  privacy.textContent = '광고 개인정보 설정';
  privacy.hidden = true;
  calendar.append(privacy);
  async function consent() {
    const info = await AdMob.requestConsentInfo();
    privacy.hidden = info.privacyOptionsRequirementStatus !== 'REQUIRED';
    const result = info.isConsentFormAvailable && info.status === 'REQUIRED' ? await AdMob.showConsentForm() : info;
    privacy.hidden = result.privacyOptionsRequirementStatus !== 'REQUIRED';
    canShow = result.canRequestAds === true;
  }
  privacy.onclick = async () => {
    if (privacyOpen) return;
    privacyOpen = true;
    update();
    await queue;
    try {
      await AdMob.showPrivacyOptionsForm();
      await consent();
    } catch {
      canShow = false;
    } finally {
      privacyOpen = false;
      update();
    }
  };
  try {
    await consent();
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, size => {
      if (nativeBanner) reserve(Math.max(0, Number(size.height) || 0));
    });
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => reserve(0));
    new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['data-screen'] });
    new MutationObserver(update).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('visibilitychange', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', () => setTimeout(update, 0));
    update();
  } catch {
    reserve(0);
  }
}
