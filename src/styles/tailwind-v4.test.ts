import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import tailwindcss from '@tailwindcss/postcss';
import postcss, { AtRule, type Declaration, type Node } from 'postcss';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

const globalsCss = read('src', 'styles', 'globals.css');
const globalsCssPath = join(ROOT, 'src', 'styles', 'globals.css');
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

  it('establishes canonical layers before token sources and maps every semantic color inline', () => {
    expect(globalsCss.indexOf('@layer theme, base, components, utilities')).toBeLessThan(
      globalsCss.indexOf("@import './themes.css' layer(base)"),
    );
    expect(globalsCss.indexOf("@import './themes.css' layer(base)")).toBeLessThan(
      globalsCss.indexOf("@import './a11y.css' layer(base)"),
    );
    expect(globalsCss).toContain('@theme inline');

    for (const token of semanticColors) {
      expect(globalsCss).toContain(`--color-${token}: hsl(var(--${token}))`);
    }
  });

  it('compiles product font and elevation tokens into a layer that outranks Tailwind defaults', async () => {
    const result = await postcss([tailwindcss({ base: ROOT })]).process(globalsCss, {
      from: globalsCssPath,
    });
    const layerOrder: string[] = [];

    result.root.walkAtRules('layer', (rule) => {
      if (!rule.nodes) {
        for (const layer of rule.params.split(',').map((name) => name.trim())) {
          if (!layerOrder.includes(layer)) layerOrder.push(layer);
        }
      }
    });

    const containingLayer = (declaration: Declaration) => {
      let node: Node | undefined = declaration.parent;
      while (node) {
        if (node instanceof AtRule && node.name === 'layer') return node.params;
        node = node.parent;
      }
      return undefined;
    };
    const declarationsInLayer = (property: string, layer: string) => {
      const declarations: Declaration[] = [];
      result.root.walkDecls(property, (declaration) => {
        if (containingLayer(declaration) === layer) declarations.push(declaration);
      });
      return declarations;
    };

    expect(layerOrder.indexOf('base')).toBeGreaterThan(layerOrder.indexOf('theme'));

    const expectedProductDeclarations = {
      '--font-mono': ['var(--font-jetbrains), ui-monospace, monospace'],
      '--shadow-sm': [
        '0 1px 2px hsl(24 30% 20% / 0.05)',
        '0 1px 2px hsl(0 0% 0% / 0.32)',
        '0 1px 2px hsl(280 40% 40% / 0.08)',
        '0 1px 2px hsl(220 20% 20% / 0.07)',
        '0 2px 0 hsl(212 60% 40% / 0.12)',
        '0 1px 1px hsl(0 0% 0% / 0.08)',
      ],
      '--shadow-lg': [
        '0 14px 44px -14px hsl(24 40% 20% / 0.26)',
        '0 20px 52px -14px hsl(0 0% 0% / 0.62)',
        '0 20px 48px -14px hsl(300 60% 50% / 0.3)',
        '0 16px 40px -16px hsl(220 20% 20% / 0.22)',
        '0 6px 0 hsl(212 60% 40% / 0.14), 0 22px 44px -14px hsl(212 80% 40% / 0.34)',
        '0 2px 6px hsl(0 0% 0% / 0.14)',
      ],
    } as const;

    for (const [property, values] of Object.entries(expectedProductDeclarations)) {
      const productValues = declarationsInLayer(property, 'base').map(
        (declaration) => declaration.value,
      );
      expect(productValues).toEqual(expect.arrayContaining([...values]));
      expect(declarationsInLayer(property, 'theme')).not.toHaveLength(0);
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
