import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.env.NODE_ENV || 'production';
const env = { ...loadEnv(mode, project, ''), ...process.env };
const testPrefix = 'ca-app-pub-3940256099942544';

function appId(platform, googleSampleId) {
  const value = env['ADMOB_' + platform + '_APP_ID'];
  const unit = env['VITE_ADMOB_' + platform + '_BANNER_ID'];
  if (value && !/^ca-app-pub-\d{16}~\d{10}$/.test(value)) {
    throw new Error('ADMOB_' + platform + '_APP_ID must be an AdMob application ID with a tilde.');
  }
  if (unit && (!/^ca-app-pub-\d{16}\/\d{10}$/.test(unit) || !value || value.startsWith(testPrefix)
      || unit.split('/')[0] !== value.split('~')[0])) {
    throw new Error('Configure matching production application and banner IDs for ' + platform + '.');
  }
  // Required by Google SDK at native startup even when ad serving is disabled.
  return value || googleSampleId;
}

function setAndroid(xml, name, value) {
  const pattern = new RegExp('<meta-data\\s+[^>]*android:name="' + name.replaceAll('.', '\\.') + '"[^>]*/>');
  const tag = '<meta-data android:name="' + name + '" android:value="' + value + '" />';
  if (pattern.test(xml)) return xml.replace(pattern, tag);
  if (!xml.includes('</application>')) throw new Error('Android application element missing.');
  return xml.replace('</application>', tag + '\n    </application>');
}

function setPlist(xml, key, value) {
  const pattern = new RegExp('<key>' + key + '</key>\\s*(?:<string>[^<]*</string>|<(?:true|false)\\s*/>)');
  const entry = '<key>' + key + '</key>\n\t' + value;
  if (pattern.test(xml)) return xml.replace(pattern, entry);
  if (!/<\/dict>\s*<\/plist>/.test(xml)) throw new Error('Root Info.plist dictionary missing.');
  return xml.replace(/<\/dict>(\s*<\/plist>)/, '\t' + entry + '\n</dict>$1');
}

function patch(path, edit) {
  const file = resolve(project, path);
  if (!existsSync(file)) return;
  const before = readFileSync(file, 'utf8');
  const after = edit(before);
  if (before !== after) writeFileSync(file, after);
}

patch('android/app/src/main/AndroidManifest.xml', xml => {
  let changed = setAndroid(xml, 'com.google.android.gms.ads.APPLICATION_ID', appId('ANDROID', testPrefix + '~3347511713'));
  return setAndroid(changed, 'com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT', 'true');
});
patch('ios/App/App/Info.plist', xml => {
  let changed = setPlist(xml, 'GADApplicationIdentifier', '<string>' + appId('IOS', testPrefix + '~1458002511') + '</string>');
  return setPlist(changed, 'GADDelayAppMeasurementInit', '<true/>');
});
