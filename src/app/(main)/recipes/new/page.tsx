import { type Metadata } from 'next';

import { getCurrentUser } from '~/server/auth';
import { getLimitStatus } from '~/server/billing/entitlements';
import { listUserGroups } from '~/server/recipes/queries';
import { RecipeEditor } from '~/components/recipe/recipe-editor';
import { listCustomUnits } from '~/server/units/queries';
import { toCustomUnitDefs } from '~/lib/unit-prefs';
import { isDbConfigured } from '~/server/db';
import { safeSharedImageUrl } from '~/lib/share-target';
import { UsageLimitNotice } from '~/components/billing/usage-limit-notice';
import { withRouteMessages } from '~/components/i18n/route-messages';

export const metadata: Metadata = { title: 'New recipe' };

async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ cover?: string; title?: string; import?: string }>;
}) {
  const { cover, title, import: importUrl } = await searchParams;
  // Only a Cloudinary https URL we just uploaded (via the photo share target)
  // is trusted as a pre-filled cover. Anything else is ignored.
  const initialCoverImageUrl = safeSharedImageUrl(cover);
  // A recipe URL shared into the PWA (Web Share Target, #50) arrives as
  // ?import=<url>. Pre-fill the importer so the share flow doesn't dead-end.
  const initialImportUrl =
    typeof importUrl === 'string' && importUrl.trim().length > 0
      ? importUrl.trim().slice(0, 2048)
      : undefined;
  // A searched-but-missing recipe can seed the title (#103). Trim/cap to keep it
  // sane. The editor still requires the user to confirm and save.
  const initialTitle =
    typeof title === 'string' && title.trim().length > 0 ? title.trim().slice(0, 120) : undefined;

  const user = await getCurrentUser();
  const groups = user ? await listUserGroups(user.id) : [];
  const customUnits =
    user && isDbConfigured() ? toCustomUnitDefs(await listCustomUnits(user.id)) : [];

  // Surface the recipe soft-limit (#318) before the editor: a gentle heads-up as
  // the free cap approaches, and a calm note once reached. Creating is still
  // possible in the editor. The create action returns the upgrade prompt. So
  // this never hard-blocks drafting.
  const limit = user ? await getLimitStatus(user, 'maxRecipes', 'recipes') : null;

  return (
    <>
      {limit && limit.limit !== null && limit.state !== 'ok' ? (
        <div className="container pt-6">
          <UsageLimitNotice used={limit.used} limit={limit.limit} state={limit.state} />
        </div>
      ) : null}
      <RecipeEditor
        mode="create"
        groups={groups}
        customUnits={customUnits}
        initialCoverImageUrl={initialCoverImageUrl}
        initialTitle={initialTitle}
        initialImportUrl={initialImportUrl}
        draftOwnerId={user?.id}
      />
    </>
  );
}

export default withRouteMessages(NewRecipePage);
