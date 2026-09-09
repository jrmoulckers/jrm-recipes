import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

const globalsCss = read('src', 'styles', 'globals.css');
const packageJson = JSON.parse(read('package.json')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const postcssConfig = read('postcss.config.js');

const semanticColors = [
  'border',
  'input',
  'ring',
  'background',
  'foreground',
  'surface',
  'surface-foreground',
  'surface-muted',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  'info',
  'info-foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
] as const;

describe('Tailwind CSS 4 configuration', () => {
  it('uses the v4 PostCSS plugin without v3 compatibility dependencies', () => {
    expect(packageJson.devDependencies.tailwindcss).toMatch(/^\^4\./);
    expect(packageJson.devDependencies['@tailwindcss/postcss']).toMatch(/^\^4\./);
    expect(packageJson.devDependencies.autoprefixer).toBeUndefined();
    expect(packageJson.dependencies['tailwindcss-animate']).toBeUndefined();
    expect(postcssConfig).toContain("'@tailwindcss/postcss': {}");
    expect(existsSync(join(ROOT, 'tailwind.config.ts'))).toBe(false);
  });

  it('loads token sources before accessibility overrides and maps every semantic color inline', () => {
    expect(globalsCss.indexOf("@import './themes.css' layer(base)")).toBeLessThan(
      globalsCss.indexOf("@import './a11y.css' layer(base)"),
    );
    expect(globalsCss).toContain('@theme inline');

    for (const token of semanticColors) {
      expect(globalsCss).toContain(`--color-${token}: hsl(var(--${token}))`);
    }
  });

  it('keeps class dark mode and the Cook Mode landscape variant in CSS', () => {
    expect(globalsCss).toContain('@custom-variant dark (&:is(.dark *))');
    expect(globalsCss).toMatch(/html\.dark\s*\{\s*color-scheme:\s*dark/);
    expect(globalsCss).toContain(
      '@custom-variant short-landscape (@media (orientation: landscape) and (max-height: 640px))',
    );
  });

  it('preserves token-driven focus, layout, and animation bindings', () => {
    expect(globalsCss).toContain('--ring-width-2: var(--ring-width)');
    expect(globalsCss).toContain('--spacing-safe-t: env(safe-area-inset-top)');
    expect(globalsCss).toContain('@media (width >= 1200px)');
    expect(globalsCss).toContain('--animate-accordion-down:');
    expect(globalsCss).toContain('--animate-shimmer:');
    expect(globalsCss).toContain('@keyframes accordion-down');
    expect(globalsCss).toContain('@keyframes shimmer');
  });

  it('keeps same-name font and easing tokens out of the theme namespace', () => {
    const themeBlock = globalsCss
      .slice(globalsCss.indexOf('@theme inline'), globalsCss.indexOf('@utility font-display'))
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const token of [
      'font-display',
      'font-body',
      'font-mono',
      'ease-standard',
      'ease-emphasized',
    ]) {
      expect(themeBlock).not.toContain(`--${token}: var(--${token})`);
      expect(globalsCss).toContain(`@utility ${token}`);
    }
  });
});
