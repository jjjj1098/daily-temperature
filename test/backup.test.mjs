import assert from 'node:assert/strict';
import test from 'node:test';
import {parseBackup} from '../app/backup.js';

const event = {id: 'a', title: '회의', date: '2030-11-03', cat: 0, start: '09:00', end: '10:00'};
const wrap = e => JSON.stringify({format: 'daily-temperature/calendar', version: 1, data: {date: '2030-11-03', events: [e]}});

test('place, url and memo survive a backup round-trip', () => {
  const extra = {place: '강남역', url: 'https://naver.com', memo: '준비물 챙기기'};
  const [restored] = parseBackup(wrap({...event, ...extra})).events;
  assert.deepEqual({place: restored.place, url: restored.url, memo: restored.memo}, extra);
});

test('events without the new fields still restore', () => {
  assert.equal(parseBackup(wrap(event)).events.length, 1);
});

test('non-text or oversized place/url/memo is rejected', () => {
  assert.throws(() => parseBackup(wrap({...event, memo: 123})), /장소·URL·메모/);
  assert.throws(() => parseBackup(wrap({...event, url: 'x'.repeat(501)})), /장소·URL·메모/);
});
