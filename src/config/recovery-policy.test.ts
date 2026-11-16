import { describe, expect, it } from 'vitest';
import { recoveryHorizon, recoveryPolicy } from './recovery-policy.js';

describe('recovery-copy policy', () => {
  const completed = new Date('2026-09-10T22:30:00Z');
  it.each([
    ['6', undefined, '2026-09-11T04:30:00Z'],
    ['168', undefined, '2026-09-17T22:30:00Z'],
    ['168', '2026-09-20T01:00:00+02:00', '2026-09-19T23:00:00Z'],
    ['168', '2026-09-11T01:00:00Z', '2026-09-17T22:30:00Z'],
  ])('covers rolling %s hours and fixed expiry %s', (hours, expiry, expected) => {
    expect(
      recoveryHorizon(
        completed,
        recoveryPolicy({ BACKUP_RETENTION_HOURS: hours, RECOVERY_COPY_EXPIRES_AT: expiry }),
      ),
    ).toEqual(new Date(expected));
  });

  it.each([undefined, '', '0', '-1', '1.5', 'Infinity', ' 168', '1e3', '876001'])(
    'refuses missing or invalid retention %s rather than guessing a provider default',
    (hours) => {
      expect(() => recoveryPolicy({ BACKUP_RETENTION_HOURS: hours })).toThrow(
        /BACKUP_RETENTION_HOURS/,
      );
    },
  );
  it.each([
    '',
    '2026-09-20',
    '2026-09-20T01:00:00',
    '2026-02-29T01:00:00Z',
    '2026-04-31T01:00:00Z',
    '2026-13-01T01:00:00Z',
    '2026-09-00T01:00:00Z',
    '2026-09-20T24:00:00Z',
    '2026-09-20T01:60:00Z',
    '2026-09-20T01:00:60Z',
    '2026-09-20T01:00:00+24:00',
    '2026-09-20T01:00:00+01:60',
    '2026-09-20T01:00:00-00:00',
  ])('refuses ambiguous or normalized fixed-copy expiry %s', (expiry) => {
    expect(() =>
      recoveryPolicy({
        BACKUP_RETENTION_HOURS: '168',
        RECOVERY_COPY_EXPIRES_AT: expiry,
      }),
    ).toThrow(/RECOVERY_COPY_EXPIRES_AT/);
  });
  it('accepts leap days and refuses horizon overflow', () => {
    expect(
      recoveryPolicy({
        BACKUP_RETENTION_HOURS: '168',
        RECOVERY_COPY_EXPIRES_AT: '2028-02-29T00:00:00.123Z',
      }).fixedCopyExpiresAtMs,
    ).toBe(Date.parse('2028-02-29T00:00:00.123Z'));
    expect(() =>
      recoveryHorizon(
        new Date(8640000000000000),
        recoveryPolicy({
          BACKUP_RETENTION_HOURS: '168',
        }),
      ),
    ).toThrow(/date range/);
  });
});
