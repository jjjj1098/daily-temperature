const FORMAT = 'daily-temperature/calendar';
const VERSION = 1;
const DEFAULT_LABELS = ['회의', '운동', '개인', '업무'];
const DEFAULT_COLORS = ['#d7766f', '#529979', '#a183b7', '#6e91bb'];
const ALARMS = ['없음', '시작 시각', '10분 전', '30분 전', '1시간 전', '하루 전'];

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

function isTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function range(value, min, max) {
  return Number.isInteger(value) && min <= value && value <= max;
}

function validateEvent(event, seen, labelCount) {
  requireValid(isRecord(event)
    && typeof event.id === 'string' && event.id.length && !seen.has(event.id)
    && typeof event.title === 'string' && event.title.trim()
    && isDate(event.date) && range(event.cat, 0, labelCount - 1)
    && (event.allDay === undefined || typeof event.allDay === 'boolean')
    && (event.alarm === undefined || ALARMS.includes(event.alarm) || Array.isArray(event.alarm) && event.alarm.every(a=>ALARMS.includes(a))),
    '일정 제목, 날짜, 라벨 또는 알림 정보를 확인해 주세요.');
  const validTimes = event.allDay
    ? event.start === '00:00' && event.end === '24:00'
    : isTime(event.start) && (isTime(event.end) || event.end === '24:00') && (event.start < event.end || isDate(event.endDate) && event.endDate>event.date);
  const optionalText = (value, max) => value === undefined || typeof value === 'string' && value.length <= max;
  requireValid(optionalText(event.place, 120) && optionalText(event.url, 500) && optionalText(event.memo, 1500),
    '일정의 장소·URL·메모 내용을 확인해 주세요.');
  requireValid(validTimes, '일정의 시작·종료 시간이 올바르지 않아요.');
  requireValid(!event.endDate || isDate(event.endDate)&&event.endDate>=event.date,'일정의 종료 날짜를 확인해 주세요.');
  seen.add(event.id);
  const rule = event.rule;
  requireValid(event.excludedDates === undefined || (isRecord(rule)
    && Array.isArray(event.excludedDates) && event.excludedDates.every(isDate)
    && new Set(event.excludedDates).size === event.excludedDates.length),
    '반복 일정의 제외 날짜를 확인해 주세요.');
  requireValid(event.seriesId === undefined || (typeof event.seriesId === 'string' && rule == null),
    '변경된 회차의 원래 반복 일정을 확인해 주세요.');
  if (rule == null) return;
  requireValid(isRecord(rule) && ['day', 'week', 'month', 'year'].includes(rule.unit)
    && range(rule.interval, 1, 999) && (!rule.until || (isDate(rule.until) && rule.until >= event.date))
    && (rule.weekdays === undefined || (Array.isArray(rule.weekdays)
      && rule.weekdays.every(day => range(day, 0, 6))))
    && (rule.unit !== 'week' || rule.weekdays?.length > 0),
    '일정의 반복 주기·요일·종료일을 확인해 주세요.');
}

export function parseBackup(text) {
  let input;
  try {
    input = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('JSON 백업 파일을 읽을 수 없어요.');
  }
  requireValid(isRecord(input), '매일의 온도 백업 파일을 골라 주세요.');
  let state = input;
  if (Object.hasOwn(input, 'format') || Object.hasOwn(input, 'version') && Object.hasOwn(input, 'data')) {
    requireValid(input.format === FORMAT && input.version === VERSION, '이 백업 형식 또는 버전을 지원하지 않아요.');
    state = input.data;
  } else if (Object.hasOwn(input, 'privateContent')) {
    state = input.privateContent;
  }
  requireValid(isRecord(state) && isDate(state.date) && Array.isArray(state.events), '달력 데이터가 없는 파일이에요.');

  // Early calendar snapshots used four fixed labels and stored the active filter by name.
  const labels = state.labels === undefined ? [...DEFAULT_LABELS] : state.labels;
  requireValid(Array.isArray(labels) && labels.length > 0, '라벨 목록을 확인해 주세요.');
  const colors = state.colors === undefined ? labels.map((_, i) => DEFAULT_COLORS[i % DEFAULT_COLORS.length]) : state.colors;
  requireValid(labels.every(name => typeof name === 'string' && name.trim()) && new Set(labels).size === labels.length
    && Array.isArray(colors) && colors.length === labels.length
    && colors.every(color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)), '라벨 이름과 색상 구성을 확인해 주세요.');
  const seen = new Set();
  state.events.forEach(event => validateEvent(event, seen, labels.length));
  const seriesIds = new Set(state.events.filter(event => event.rule).map(event => event.id));
  requireValid(state.events.every(event => event.seriesId === undefined || seriesIds.has(event.seriesId)),
    '변경된 회차의 원래 반복 일정이 없어요.');
  const moods = state.moods === undefined ? {} : state.moods;
  requireValid(isRecord(moods) && Object.entries(moods).every(([date, mood]) =>
    isDate(date) && isRecord(mood) && typeof mood.name === 'string' && mood.name.trim()
    && typeof mood.emoji === 'string' && mood.emoji.trim()), '날짜별 기분 기록을 확인해 주세요.');
  const modules = state.modules ?? (range(state.type, 0, 3) ? [state.type] : [0, 2]);
  const filter = typeof state.filter === 'string' && state.filter !== '전체' ? labels.indexOf(state.filter) : state.filter ?? '전체';
  requireValid(Array.isArray(modules) && modules.every(index => range(index, 0, 3)) && new Set(modules).size === modules.length
    && (filter === '전체' || range(filter, 0, labels.length - 1)) && range(state.view ?? 0, 0, 2)
    && ['calendar', 'lock'].includes(state.screen ?? 'calendar') && typeof (state.showMood ?? false) === 'boolean',
    '달력 보기 또는 잠금화면 설정을 확인해 주세요.');
  return {...state, labels, colors, modules, filter, moods, view: state.view ?? 0,
    screen: state.screen ?? 'calendar', showMood: state.showMood ?? false};
}

async function shareBackup(state) {
  const now = new Date();
  const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const filename = '매일의온도-' + stamp + '.json';
  const data = JSON.stringify({format: FORMAT, version: VERSION, exportedAt: now.toISOString(), data: state});
  if (globalThis.Capacitor?.isNativePlatform?.()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'), import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({path: filename, directory: Directory.Cache, encoding: Encoding.UTF8, data});
    await Share.share({files: [uri], title: '매일의 온도 백업', dialogTitle: '백업 파일 저장 또는 공유'});
    return '백업 파일을 준비했어요.';
  }
  const url = URL.createObjectURL(new Blob([data], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return '백업 파일 다운로드를 시작했어요.';
}

export function initBackup(container, getData, applyData) {
  container.innerHTML = `
    <style>
      .temperature-backup{margin:12px 0;border-top:1px solid var(--rule,#d9e1dc);padding:10px 2px}
      .temperature-backup summary{cursor:pointer;font-weight:650;font-size:14px}
      .temperature-backup p{margin:8px 0;color:var(--sub,inherit);font-size:13px}
      .temperature-backup [role=status]:empty{display:none}
      .temperature-backup .backup-actions{display:flex;gap:6px;flex-wrap:wrap}
      .temperature-backup .backup-actions button{min-height:42px;color:var(--deep,inherit);background:var(--wash,#edf2ed);padding:6px 10px;border:0;border-radius:8px;font:inherit;cursor:pointer}
      .temperature-backup [data-backup=preview]{padding:4px 0}
      .temperature-backup [data-backup=count]{overflow-wrap:anywhere;font-weight:600}
    </style>
    <details class="temperature-backup">
      <summary>백업·복원</summary>
      <p>일정, 라벨, 기분 기록과 잠금화면 구성을 한 파일에 담아요.</p>
      <div class="backup-actions">
        <button type="button" data-backup="export">백업 내보내기</button>
        <button type="button" data-backup="pick">파일에서 복원</button>
      </div>
      <input type="file" accept=".json,application/json" aria-label="백업 파일" hidden>
      <div data-backup="preview" hidden>
        <p data-backup="count"></p>
        <p>복원하면 현재 기기의 일정과 설정이 이 파일의 내용으로 바뀌어요.</p>
        <div class="backup-actions">
          <button type="button" data-backup="cancel">취소</button>
          <button type="button" data-backup="restore">이 백업으로 복원</button>
        </div>
      </div>
      <p role="status" aria-live="polite" data-backup="status"></p>
    </details>`;
  const find = key => container.querySelector('[data-backup="' + key + '"]');
  const fileInput = container.querySelector('input[type=file]');
  const preview = find('preview'), status = find('status');
  let pending = null;

  function clearPreview() {
    pending = null;
    preview.hidden = true;
    fileInput.value = '';
  }
  async function busy(action) {
    const controls = [...container.querySelectorAll('button')];
    controls.forEach(button => { button.disabled = true; });
    try {
      await action();
    } catch (error) {
      status.textContent = error?.message || '작업을 완료하지 못했어요. 다시 시도해 주세요.';
    } finally {
      controls.forEach(button => { button.disabled = false; });
    }
  }
  find('export').onclick = () => busy(async () => { status.textContent = await shareBackup(await getData()); });
  find('pick').onclick = () => {
    clearPreview();
    status.textContent = '';
    fileInput.click();
  };
  fileInput.onchange = () => busy(async () => {
    const file = fileInput.files[0];
    clearPreview();
    if (!file) return;
    pending = parseBackup(await file.text());
    find('count').textContent = file.name + ' · 일정 ' + pending.events.length + '개 · 라벨 ' + pending.labels.length
      + '개 · 기분 기록 ' + Object.keys(pending.moods).length + '일';
    status.textContent = '';
    preview.hidden = false;
  });
  find('cancel').onclick = () => {
    clearPreview();
    status.textContent = '복원을 취소했어요.';
  };
  find('restore').onclick = () => busy(async () => {
    if (!pending) return;
    await applyData(pending);
    clearPreview();
    status.textContent = '백업을 복원했어요.';
  });
}
