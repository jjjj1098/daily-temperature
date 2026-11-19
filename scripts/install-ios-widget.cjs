// Run after `npx cap add ios`. Sources live outside the generated platform folder.
const fs = require('node:fs');
const path = require('node:path');
const xcode = require('xcode');
const plist = require('plist');

const app = path.resolve(__dirname, '../ios/App');
const projectFile = path.join(app, 'App.xcodeproj/project.pbxproj');
const project = xcode.project(projectFile);
project.parseSync();
const objects = project.hash.project.objects;
const host = project.getFirstTarget();
const groupId = 'group.app.maeilon.calendar';
const targetName = 'NextEventWidget';
const nativeDir = '../../native/ios-widget';
const rootGroup = project.getFirstProject().firstProject.mainGroup;

function configurations(target) {
  const list = objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations;
  return list.map(ref => objects.XCBuildConfiguration[ref.value]);
}

function addGroups(relativePath) {
  const location = path.join(app, relativePath);
  const current = fs.existsSync(location) ? plist.parse(fs.readFileSync(location, 'utf8')) : {};
  const groupsKey = 'com.apple.security.application-groups';
  const groups = new Set(current[groupsKey] || []);
  groups.add(groupId);
  current[groupsKey] = [...groups];
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(location, plist.build(current) + '\n');
}

function addGroupCapability(uuid) {
  const attributes = project.getFirstProject().firstProject.attributes.TargetAttributes;
  const target = attributes[uuid] ||= {};
  target.SystemCapabilities ||= {};
  target.SystemCapabilities['com.apple.ApplicationGroups.iOS'] = { enabled: 1 };
}

const delegatePath = path.join(app, 'App/AppDelegate.swift');
let delegate = fs.readFileSync(delegatePath, 'utf8');
const launchMethod = /(didFinishLaunchingWithOptions[^\n]+-> Bool \{)/;
if (!delegate.includes('WidgetSnapshotBridge.start()')) {
  if (!launchMethod.test(delegate)) throw Error('AppDelegate launch method not found');
  delegate = delegate.replace(launchMethod, '$1\n        WidgetSnapshotBridge.start()');
}

const unquote = str => String(str).replace(/^"|"$/g, '');
const targetByName = Object.entries(objects.PBXNativeTarget).find(([, item]) => unquote(item.name) === targetName);
let widget;
if (targetByName) {
  widget = { uuid: targetByName[0], pbxNativeTarget: targetByName[1] };
} else {
  // The Capacitor template initially has no targets depending on another target.
  objects.PBXContainerItemProxy ||= {};
  objects.PBXTargetDependency ||= {};
  widget = project.addTarget(targetName, 'app_extension', targetName, 'app.maeilon.calendar.next');
  project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', widget.uuid);
  project.addSourceFile(nativeDir + '/NextEventWidget.swift', { target: widget.uuid }, rootGroup);
  project.addSourceFile(nativeDir + '/WidgetSnapshotBridge.swift', { target: host.uuid }, rootGroup);
}

const hostConfigs = configurations(host.firstTarget);
for (const config of hostConfigs) {
  const settings = config.buildSettings;
  settings.CODE_SIGN_ENTITLEMENTS ||= 'App/App.entitlements';
  addGroups(unquote(settings.CODE_SIGN_ENTITLEMENTS));
}
const widgetEntitlements = 'NextEventWidget/NextEventWidget.entitlements';
addGroups(widgetEntitlements);
for (const config of configurations(widget.pbxNativeTarget)) {
  const parent = hostConfigs.find(hostConfig => hostConfig.name === config.name).buildSettings;
  Object.assign(config.buildSettings, {
    APPLICATION_EXTENSION_API_ONLY: 'YES',
    CODE_SIGN_ENTITLEMENTS: widgetEntitlements,
    CODE_SIGN_STYLE: parent.CODE_SIGN_STYLE || 'Automatic',
    CURRENT_PROJECT_VERSION: parent.CURRENT_PROJECT_VERSION,
    MARKETING_VERSION: parent.MARKETING_VERSION,
    INFOPLIST_FILE: '"' + nativeDir + '/Info.plist"',
    IPHONEOS_DEPLOYMENT_TARGET: '16.0',
    SWIFT_VERSION: '5.0',
    TARGETED_DEVICE_FAMILY: parent.TARGETED_DEVICE_FAMILY,
  });
  if (parent.DEVELOPMENT_TEAM) config.buildSettings.DEVELOPMENT_TEAM = parent.DEVELOPMENT_TEAM;
}

addGroupCapability(host.uuid);
addGroupCapability(widget.uuid);

const privacyFile = 'App/PrivacyInfo.xcprivacy';
const privacyPath = path.join(app, privacyFile);
const manifest = fs.existsSync(privacyPath) ? plist.parse(fs.readFileSync(privacyPath, 'utf8')) : {};
const accessed = manifest.NSPrivacyAccessedAPITypes ||= [];
for (const [category, reason] of [
  ['NSPrivacyAccessedAPICategoryUserDefaults', 'CA92.1'],
  ['NSPrivacyAccessedAPICategoryFileTimestamp', 'C617.1'],
]) {
  let item = accessed.find(entry => entry.NSPrivacyAccessedAPIType === category);
  if (!item) {
    item = { NSPrivacyAccessedAPIType: category, NSPrivacyAccessedAPITypeReasons: [] };
    accessed.push(item);
  }
  if (!item.NSPrivacyAccessedAPITypeReasons.includes(reason)) item.NSPrivacyAccessedAPITypeReasons.push(reason);
}
fs.writeFileSync(privacyPath, plist.build(manifest) + '\n');
project.addResourceFile(privacyFile, { target: host.uuid, lastKnownFileType: 'text.xml' }, rootGroup);
// xcode's file helper emits the literal "undefined" for omitted file reference fields.
for (const reference of Object.values(objects.PBXFileReference)) {
  if (typeof reference !== 'object') continue;
  for (const field of ['lastKnownFileType', 'explicitFileType', 'fileEncoding']) {
    if (reference[field] === undefined || reference[field] === 'undefined') delete reference[field];
  }
}
fs.writeFileSync(delegatePath, delegate);
fs.writeFileSync(projectFile, project.writeSync());
console.log('Installed the NextEventWidget target and app-group snapshot bridge.');
