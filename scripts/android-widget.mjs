import {cp, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(project, 'native/android-widget');
const target = path.join(project, 'android/app/src/main');
const manifestFile = path.join(target, 'AndroidManifest.xml');
const manifest = await readFile(manifestFile, 'utf8');
const start = '<!-- 매일의 온도 위젯 -->';
const end = '<!-- 위젯 설정 끝 -->';
const widget = [
  start,
  '        <receiver android:name=".NextEventWidget" android:label="@string/next_widget_label" android:exported="false">',
  '            <intent-filter>',
  '                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />',
  '                <action android:name="android.intent.action.TIME_SET" />',
  '                <action android:name="android.intent.action.TIMEZONE_CHANGED" />',
  '            </intent-filter>',
  '            <meta-data android:name="android.appwidget.provider" android:resource="@xml/next_event_widget_info" />',
  '        </receiver>',
  '        <provider android:name=".WidgetPreferencesObserver" android:authorities="${applicationId}.widgetprefs" android:exported="false" />',
  '        ' + end,
].join('\n');

let updated;
if (manifest.includes(start) && manifest.includes(end)) {
  updated = manifest.slice(0, manifest.indexOf(start)) + widget + manifest.slice(manifest.indexOf(end) + end.length);
} else if (!manifest.includes(start) && !manifest.includes(end) && manifest.includes('</application>')) {
  updated = manifest.replace('</application>', '    ' + widget + '\n    </application>');
} else {
  throw new Error('AndroidManifest.xml에서 위젯 설정 위치를 확인할 수 없어요.');
}
await cp(source, target, {recursive: true});
if (updated !== manifest) await writeFile(manifestFile, updated);
console.log('매일의 온도 Android 위젯이 연결되었습니다.');
