import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CloudinaryImage } from './cloudinary-image';

afterEach(() => {
  cleanup();
});

const CLOUD = 'https://res.cloudinary.com/heirloom/image/upload/v1699999999/heirloom/cover.jpg';

describe('CloudinaryImage', () => {
  it('serves Cloudinary sources straight from the CDN with edge transforms', () => {
    const { container } = render(<CloudinaryImage src={CLOUD} alt="" width={640} height={480} />);

    const img = container.querySelector('img');
    const src = img?.getAttribute('src') ?? '';
    expect(src).toContain('res.cloudinary.com');
    expect(src).toContain('f_auto,q_auto,c_limit,w_');
    // No proxy hop through Vercel's optimizer for Cloudinary assets.
    expect(src).not.toContain('/_next/image');
  });

  it('keeps non-Cloudinary sources on the default Next optimizer', () => {
    const { container } = render(
      <CloudinaryImage src="https://img.clerk.com/photo.jpg" alt="" width={640} height={480} />,
    );

    const img = container.querySelector('img');
    const src = img?.getAttribute('src') ?? '';
    expect(src).toContain('/_next/image');
    expect(src).toContain('img.clerk.com');
  });

  it('renders off-allowlist remote hosts unoptimized so they display instead of crashing', () => {
    // A cover/step image imported straight from a recipe's source website is on
    // a host that is NOT in `remotePatterns`. Next/image would throw at render
    // and topple the recipe page into its error boundary. `unoptimized` skips
    // the optimizer + remotePatterns check so the pasted image just displays.
    const OFF_ALLOWLIST = 'https://confessionsofagroceryaddict.com/x.jpg';
    const { container } = render(
      <CloudinaryImage src={OFF_ALLOWLIST} alt="" width={640} height={480} />,
    );

    const img = container.querySelector('img');
    const src = img?.getAttribute('src') ?? '';
    const srcset = img?.getAttribute('srcset') ?? '';
    // Unoptimized renders the original URL directly. No `/_next/image` proxy in
    // either `src` or `srcset`.
    expect(src).toBe(OFF_ALLOWLIST);
    expect(src).not.toContain('/_next/image');
    expect(srcset).not.toContain('/_next/image');
  });
});
