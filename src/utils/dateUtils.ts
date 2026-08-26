/**
 * Utility functions for safely parsing and formatting timestamps from Firestore, strings, numbers, or JS Date objects.
 * Prevents "RangeError: Invalid time value" when handling Firestore Timestamps.
 */

export function parseTimestampToDate(timestamp: any): Date | null {
  if (!timestamp) return null;

  try {
    // 1. If already a JS Date object
    if (timestamp instanceof Date) {
      return isNaN(timestamp.getTime()) ? null : timestamp;
    }

    // 2. If a Firestore Timestamp object with .toDate()
    if (typeof timestamp === 'object' && typeof timestamp.toDate === 'function') {
      const d = timestamp.toDate();
      return isNaN(d.getTime()) ? null : d;
    }

    // 3. If a Firestore Timestamp object with seconds / _seconds
    if (typeof timestamp === 'object') {
      const secs = timestamp.seconds ?? timestamp._seconds;
      if (typeof secs === 'number') {
        const d = new Date(secs * 1000);
        return isNaN(d.getTime()) ? null : d;
      }
    }

    // 4. If a string or number
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch (err) {
    console.warn("[dateUtils] Date parse warning:", err);
  }

  return null;
}

export function safeIsoDateString(timestamp: any): string {
  const d = parseTimestampToDate(timestamp);
  if (!d) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
}

export function safeIsoString(timestamp: any): string {
  const d = parseTimestampToDate(timestamp);
  if (!d) return new Date().toISOString();
  return d.toISOString();
}

export function safeTimestampTime(timestamp: any): number {
  const d = parseTimestampToDate(timestamp);
  return d ? d.getTime() : 0;
}
