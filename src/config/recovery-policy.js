// @ts-check

/**
 * No provider default: a missing inventory must not become a shorter erasure promise.
 * The 100-year arithmetic limit is a validation bound, not approved retention.
 * @param {{ BACKUP_RETENTION_HOURS?: string; RECOVERY_COPY_EXPIRES_AT?: string }} vars
 */
export function recoveryPolicy(vars) {
  const hours = vars.BACKUP_RETENTION_HOURS;
  if (!hours || !/^[1-9]\d*$/.test(hours) || Number(hours) > 876000) {
    throw new Error('BACKUP_RETENTION_HOURS must be an explicit whole number from 1 to 876000.');
  }
  let fixedCopyExpiresAtMs = 0;
  const expiry = vars.RECOVERY_COPY_EXPIRES_AT;
  if (expiry !== undefined) {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(
        expiry,
      );
    if (!match || expiry.endsWith('-00:00')) {
      throw new Error('RECOVERY_COPY_EXPIRES_AT must be an offset-aware ISO instant.');
    }
    const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
    const y = Number(year);
    const m = Number(month);
    const days = [
      31,
      y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];
    const monthDays = days[m - 1];
    fixedCopyExpiresAtMs = Date.parse(expiry);
    if (
      monthDays === undefined ||
      Number(day) < 1 ||
      Number(day) > monthDays ||
      Number(hour) > 23 ||
      Number(minute) > 59 ||
      Number(second) > 59 ||
      Number(offsetHour || 0) > 23 ||
      Number(offsetMinute || 0) > 59 ||
      !Number.isFinite(fixedCopyExpiresAtMs)
    ) {
      throw new Error('RECOVERY_COPY_EXPIRES_AT must be a valid calendar instant with an offset.');
    }
  }
  return { rollingMs: Number(hours) * 60 * 60 * 1000, fixedCopyExpiresAtMs };
}

/**
 * @param {Date} completedAt
 * @param {ReturnType<typeof recoveryPolicy>} policy
 */
export function recoveryHorizon(completedAt, policy) {
  const end = Math.max(completedAt.getTime() + policy.rollingMs, policy.fixedCopyExpiresAtMs);
  if (!Number.isSafeInteger(end) || !Number.isFinite(new Date(end).getTime())) {
    throw new Error('Recovery horizon exceeds the supported date range.');
  }
  return new Date(end);
}
