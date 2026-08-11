import { withRouteMessages } from '~/components/i18n/route-messages';

import { DesignGallery } from './design-gallery';

/**
 * The gallery itself is a client component, so it lives in its own module and
 * this server segment only exists to mount the route-scoped message provider
 * (#674).
 */
function DesignGalleryPage() {
  return <DesignGallery />;
}

export default withRouteMessages(DesignGalleryPage);
