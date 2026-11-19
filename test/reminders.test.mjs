import assert from 'node:assert/strict';
import test from 'node:test';
import {planReminders} from '../app/reminders.js';

const event = {id: 'meeting', title: '회의', date: '2030-11-03', start: '15:00', alarm: '하루 전'};
const once = (e, from) => e.date >= from ? e : null;

test('day-before and all-day reminders keep local calendar times', () => {
  const result = planReminders([event, {...event, id: 'birthday', allDay: true}], once,
    new Date('2030-11-01T08:00:00'));
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(n => [n.schedule.at.getDate(), n.schedule.at.getHours()]), [[2, 9], [2, 15]]);
});

test('past alarms and disabled reminders are omitted, equal offsets are deduplicated', () => {
  const result = planReminders([{...event, alarm: ['없음', '하루 전', '10분 전', '10분 전']}], once,
    new Date('2030-11-03T14:40:00'));
  assert.equal(result.length, 1);
  assert.equal(result[0].schedule.at.getMinutes(), 50);
});

test('all series compete for the nearest slots and edits replace outdated IDs', () => {
  const recurring = {...event, rule: {unit: 'day', interval: 1}, alarm: '시작 시각'};
  const sameDay = {...event, date: '2030-11-04', start: '09:00', alarm: '시작 시각', id: 'one'};
  const next = (e, from) => e.rule ? {...e, date: from > e.date ? from : e.date} : once(e, from);
  const now = new Date('2030-11-03T09:00:00');
  const result = planReminders([recurring, sameDay], next, now, 3);
  assert.deepEqual(result.map(n => n.extra.eventId), ['meeting', 'one', 'meeting']);
  assert.deepEqual(result, planReminders([sameDay, recurring], next, now, 3));
  assert.notEqual(result[0].id, planReminders([{...recurring, title:'변경'}], next, now, 3)[0].id);
  assert.equal(new Set(result.map(n => n.id)).size, 3);
});
