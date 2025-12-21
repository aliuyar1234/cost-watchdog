export interface DigestTime {
  hour: number;
  minute: number;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function parseDailyDigestTime(value: string): DigestTime | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = TIME_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return { hour, minute };
}

function getZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.get('year')),
    month: Number(lookup.get('month')),
    day: Number(lookup.get('day')),
    hour: Number(lookup.get('hour')),
    minute: Number(lookup.get('minute')),
    second: Number(lookup.get('second')),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const utcFromParts = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return utcFromParts - date.getTime();
}

export function getLocalDateKey(date: Date, timeZone?: string): string {
  if (timeZone) {
    const parts = getZonedParts(date, timeZone);
    const year = parts.year;
    const month = String(parts.month).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getScheduledTimeForDate(base: Date, digestTime: DigestTime, timeZone?: string): Date {
  if (!timeZone) {
    const scheduled = new Date(base);
    scheduled.setHours(digestTime.hour, digestTime.minute, 0, 0);
    return scheduled;
  }

  const baseParts = getZonedParts(base, timeZone);
  const utcGuess = new Date(Date.UTC(
    baseParts.year,
    baseParts.month - 1,
    baseParts.day,
    digestTime.hour,
    digestTime.minute,
    0,
    0
  ));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
}

export function getDigestWindow(now: Date, digestTime: DigestTime, timeZone?: string): {
  digestKey: string;
  windowStart: Date;
  windowEnd: Date;
} {
  const windowEnd = getScheduledTimeForDate(now, digestTime, timeZone);
  const windowStart = new Date(windowEnd.getTime() - MS_PER_DAY);

  return {
    digestKey: getLocalDateKey(windowEnd, timeZone),
    windowStart,
    windowEnd,
  };
}
