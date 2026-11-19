// Reserve the upper half of positive 32-bit notification IDs for calendar alarms.
const ID_BASE = 0x40000000;
const MAX_PENDING = 60;
const minuteOffsets = new Map([
  ['시작 시각', 0], ['10분 전', 10], ['30분 전', 30],
  ['1시간 전', 60], ['하루 전', 1440]
]);

function localDay(value) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')].join('-');
}

function followingDay(day) {
  const date = new Date(day + 'T12:00:00');
  date.setDate(date.getDate() + 1);
  return localDay(date);
}

function reminderTime(event, offset) {
  // All-day events use 09:00 local time. "하루 전" retains the local clock time across DST.
  const date = new Date(event.date + 'T' + (event.allDay ? '09:00' : event.start) + ':00');
  if (offset === 1440) date.setDate(date.getDate() - 1);
  else date.setTime(date.getTime() - offset * 60000);
  return date;
}

function reminderId(signature, used) {
  let hash = 2166136261;
  for (let i = 0; i < signature.length; i++) {
    hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
  }
  let id = ID_BASE + (hash >>> 2);
  while (used.has(id)) id = ID_BASE + ((id - ID_BASE + 1) % ID_BASE);
  used.add(id);
  return id;
}

export function planReminders(events, nextOccurrence, now = new Date(), limit = MAX_PENDING) {
  const candidates = [];
  const today = localDay(now);
  for (const event of events) {
    const alarms = Array.isArray(event.alarm) ? event.alarm : [event.alarm];
    for (const alarm of new Set(alarms)) {
      const offset = minuteOffsets.get(alarm);
      if (offset === undefined) continue;
      let cursor = today, count = 0;
      while (count < limit) {
        const item = nextOccurrence(event, cursor);
        if (!item || item.date < cursor) break;
        const at = reminderTime(item, offset);
        if (!Number.isFinite(at.getTime())) break;
        if (at > now) {
          candidates.push({
            title: '매일의 온도',
            body: (item.allDay ? '종일' : item.start) + ' · ' + (item.private ? '예정된 일정' : item.title),
            schedule: {at, allowWhileIdle: true},
            extra: {eventId: event.id, date: item.date, alarm}
          });
          count++;
        }
        if (!event.rule) break;
        cursor = followingDay(item.date);
      }
    }
  }
  candidates.sort((a, b) => a.schedule.at - b.schedule.at ||
    String(a.extra.eventId).localeCompare(String(b.extra.eventId)) || a.extra.alarm.localeCompare(b.extra.alarm));
  const used = new Set();
  return candidates.slice(0, limit).map(reminder => {
    const signature = JSON.stringify([reminder.extra, reminder.schedule.at.getTime(), reminder.title, reminder.body]);
    return { ...reminder, id: reminderId(signature, used) };
  });
}

function result(status, message, reminders = []) {
  return {status, message, count: reminders.length,
    through: reminders.at(-1)?.schedule.at.toISOString() ?? null};
}

async function reconcile(events, nextOccurrence, requestPermission) {
  const {Capacitor} = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return result('unsupported', '기기 알림은 모바일 앱에서 받을 수 있어요.');
  const {LocalNotifications} = await import('@capacitor/local-notifications');
  const {notifications: pending} = await LocalNotifications.getPending();
  const owned = pending.filter(({id}) => id >= ID_BASE);
  const capacity = Math.max(0, MAX_PENDING - (pending.length - owned.length));
  const wanted = planReminders(events, nextOccurrence, new Date(), capacity);
  const wantedIds = new Set(wanted.map(n => n.id));
  const obsolete = owned.filter(n => !wantedIds.has(n.id)).map(({id}) => ({id}));
  if (obsolete.length) await LocalNotifications.cancel({notifications: obsolete});
  if (!wanted.length) return result('scheduled', '예약할 일정 알림이 없어요.');

  let {display} = await LocalNotifications.checkPermissions();
  if (requestPermission && (display === 'prompt' || display === 'prompt-with-rationale')) {
    ({display} = await LocalNotifications.requestPermissions());
  }
  if (display === 'denied') return result('denied', '휴대폰 설정에서 매일의 온도 알림을 허용해 주세요.');
  if (display !== 'granted') return result('needs-permission', '기기 알림을 받으려면 알림 권한이 필요해요.');

  const existing = new Set(owned.map(n => n.id));
  const missing = wanted.filter(n => !existing.has(n.id));
  if (missing.length) await LocalNotifications.schedule({notifications: missing});
  return result('scheduled', '다가오는 알림 ' + wanted.length + '개를 예약했어요.', wanted);
}

let syncQueue = Promise.resolve();

// Serialize native writes so a slow earlier save cannot resurrect a deleted alarm.
export function syncReminders(events, nextOccurrence, {requestPermission = false} = {}) {
  const snapshot = [...events];
  syncQueue = syncQueue.then(() => reconcile(snapshot, nextOccurrence, requestPermission)).catch(error => {
    console.error('일정 알림 예약 실패', error);
    return result('error', '기기 알림을 예약하지 못했어요. 앱을 다시 열면 재시도해요.');
  });
  return syncQueue;
}
