'use strict';
/* Der "Tag" für Belohnungen: Kalendertag in Deutschland (Europe/Berlin), damit er um Mitternacht deutscher Zeit wechselt. */
const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (now = Date.now()) => fmt.format(new Date(now));
const prevDayKey = (now = Date.now()) => {
  // 26 h zurück kann nie denselben Tag treffen und überspringt keinen (Zeitumstellung: 23–25 h)
  const k = dayKey(now); let t = now - 20 * 3600 * 1000;
  while (dayKey(t) === k) t -= 3600 * 1000;
  return dayKey(t);
};
module.exports = { dayKey, prevDayKey };
