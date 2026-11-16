import { describe, expect, it } from 'vitest';
import { BUILD, BUILD_STAMP, formatBuildStamp } from '../src/app-info';
import pkg from '../package.json';

describe('build stamp', () => {
  it('shows version, short commit and date for a CI build', () => {
    expect(
      formatBuildStamp({
        version: '1.0.0',
        sha: 'a7407899c1f2e3d4b5a6978877665544332211ff',
        date: '2026-11-16',
      }),
    ).toBe('v1.0.0 · a740789 · 2026-11-16');
  });

  it('marks a local build as dev', () => {
    expect(formatBuildStamp({ version: '0.1.0', sha: '', date: '' })).toBe('v0.1.0 · dev');
  });

  it('leaves out a missing date but keeps the commit', () => {
    expect(formatBuildStamp({ version: '0.1.0', sha: 'abcdef1234', date: '' })).toBe(
      'v0.1.0 · abcdef1',
    );
  });

  it('takes the version from package.json', () => {
    expect(BUILD.version).toBe(pkg.version);
    expect(BUILD_STAMP.startsWith(`v${pkg.version}`)).toBe(true);
  });
});
