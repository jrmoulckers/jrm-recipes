# Changelog

All notable changes to Heirloom are documented here. This file is maintained
automatically by [release-please](https://github.com/googleapis/release-please)
from [Conventional Commits](https://www.conventionalcommits.org/) merged to
`main` (see `.github/workflows/release.yml`).

## [0.3.0](https://github.com/jrmoulckers/jrm-recipes/compare/heirloom-v0.2.0...heirloom-v0.3.0) (2026-08-08)


### Features

* **auth:** align Clerk UI with the design system ([#581](https://github.com/jrmoulckers/jrm-recipes/issues/581)) ([bca61dc](https://github.com/jrmoulckers/jrm-recipes/commit/bca61dcde9dbeb14ef522ac0455b0475ae9dc277))
* **cron:** schedule and send weekly digest + cook-along reminders ([#565](https://github.com/jrmoulckers/jrm-recipes/issues/565)) ([5f82682](https://github.com/jrmoulckers/jrm-recipes/commit/5f82682a1a5e711078785c9cfc5d7e4b6bb0302f))
* estimate recipe nutrition from ingredients ([#568](https://github.com/jrmoulckers/jrm-recipes/issues/568)) ([f947866](https://github.com/jrmoulckers/jrm-recipes/commit/f947866962d2ebff15b2ba3eaf5d4082e95b10b3))
* **food-db:** add food/ingredient DB and food-type unit suggestions ([5bfcba5](https://github.com/jrmoulckers/jrm-recipes/commit/5bfcba5d96c591ac5409dc3a1d542c0a6c31a10c))
* **food-graph:** auto-estimate per-serving nutrition on recipe view ([dd2e75e](https://github.com/jrmoulckers/jrm-recipes/commit/dd2e75e05fc5eee501d8b54a0fb3a0ddf6b2a2fb))
* **food-graph:** live crowd-sourced food knowledge graph (Phase 1) ([463a61d](https://github.com/jrmoulckers/jrm-recipes/commit/463a61d99406120c758569e36bd995f11c3ea82a))
* **food-graph:** live refresh on recipe save + pairing suggestions (Phase 2) ([1142f8a](https://github.com/jrmoulckers/jrm-recipes/commit/1142f8a70581de10876aef754db80385facccf3b))
* **food-graph:** Phase 3 personalization + reverse index ([25fc6f5](https://github.com/jrmoulckers/jrm-recipes/commit/25fc6f5d98793847835e9b86e6cd7dfcf1e53642))
* **food-graph:** Phase 4 nutrition + per-recipe roll-up ([d2dc874](https://github.com/jrmoulckers/jrm-recipes/commit/d2dc874fdb4ae5cfb87ac4ddcd8ce9b377af082e))
* ingredient-led recipe search and discovery ([#567](https://github.com/jrmoulckers/jrm-recipes/issues/567)) ([4e8362d](https://github.com/jrmoulckers/jrm-recipes/commit/4e8362d4b342b86a6c8e66b1a9d72fa5416ac62b))
* link recipe ingredients to canonical food graph ([#563](https://github.com/jrmoulckers/jrm-recipes/issues/563)) ([76537f9](https://github.com/jrmoulckers/jrm-recipes/commit/76537f90a70a69a745eceaa90227a8b3063a8ff4))
* notify on reactions ([#562](https://github.com/jrmoulckers/jrm-recipes/issues/562)) ([e932235](https://github.com/jrmoulckers/jrm-recipes/commit/e9322359f5cfa3426503f4f1b64979ee3a95aeb9))
* opt-in public follow graph and following feed ([#570](https://github.com/jrmoulckers/jrm-recipes/issues/570)) ([0f7dbde](https://github.com/jrmoulckers/jrm-recipes/commit/0f7dbde4ea56913e9f6c35ff6cf30d39e848098b))
* personal cross-group activity feed ([#564](https://github.com/jrmoulckers/jrm-recipes/issues/564)) ([b1f3907](https://github.com/jrmoulckers/jrm-recipes/commit/b1f390764b1903ac96f340d170c664af12174284))
* **planner:** allocate leftover servings ([#616](https://github.com/jrmoulckers/jrm-recipes/issues/616)) ([e84c354](https://github.com/jrmoulckers/jrm-recipes/commit/e84c354e6b5436b46b38c5ebb3ffd4e9e91feb6a))
* **recipes:** add default recipe imagery ([#594](https://github.com/jrmoulckers/jrm-recipes/issues/594)) ([#596](https://github.com/jrmoulckers/jrm-recipes/issues/596)) ([437fe33](https://github.com/jrmoulckers/jrm-recipes/commit/437fe335a9d72471e4e41560b846f7a08aaa11ca))
* **recipes:** choose semantic fallback images ([#603](https://github.com/jrmoulckers/jrm-recipes/issues/603)) ([#604](https://github.com/jrmoulckers/jrm-recipes/issues/604)) ([067e934](https://github.com/jrmoulckers/jrm-recipes/commit/067e934dc7dec0fa5685ed9c75e4a072a2ca66b7))
* **recipes:** expand semantic fallback imagery ([#606](https://github.com/jrmoulckers/jrm-recipes/issues/606)) ([9d5d2b0](https://github.com/jrmoulckers/jrm-recipes/commit/9d5d2b01366eb82f4cee88c58d97cbacbda6f70b))
* **recipes:** redesign the recipe creation & editing experience ([#555](https://github.com/jrmoulckers/jrm-recipes/issues/555)) ([cd2baa0](https://github.com/jrmoulckers/jrm-recipes/commit/cd2baa0ae60a875ccd2db6c603f0e63107534579))
* **recipes:** standardize recipe classifications ([#609](https://github.com/jrmoulckers/jrm-recipes/issues/609)) ([#617](https://github.com/jrmoulckers/jrm-recipes/issues/617)) ([b89ac9b](https://github.com/jrmoulckers/jrm-recipes/commit/b89ac9b2981a6ff048c5f6e7fe31520d722332eb))
* **scripts:** add prod-safe food-graph seed (db:seed-food-graph) ([#571](https://github.com/jrmoulckers/jrm-recipes/issues/571)) ([131f8d4](https://github.com/jrmoulckers/jrm-recipes/commit/131f8d401e1a3059ab7238c51dcf598ab857efb3))
* **search:** dietary filter ([#273](https://github.com/jrmoulckers/jrm-recipes/issues/273)) ([#533](https://github.com/jrmoulckers/jrm-recipes/issues/533)) ([76619cb](https://github.com/jrmoulckers/jrm-recipes/commit/76619cb3ad0d185ad3979e5a51f8f4ec066b987e))
* **search:** family/group filter and "only mine" toggle ([#91](https://github.com/jrmoulckers/jrm-recipes/issues/91)) ([#535](https://github.com/jrmoulckers/jrm-recipes/issues/535)) ([08c96e9](https://github.com/jrmoulckers/jrm-recipes/commit/08c96e9935e30e8e7b3ddc88e949b41fde3e1204))
* **search:** global search + ⌘K command palette ([#74](https://github.com/jrmoulckers/jrm-recipes/issues/74)) ([#532](https://github.com/jrmoulckers/jrm-recipes/issues/532)) ([2861fe4](https://github.com/jrmoulckers/jrm-recipes/commit/2861fe4fdbda635d68bcd910f433703e04de8c16))
* structured allergens on the food graph with proactive meal-plan gating ([#569](https://github.com/jrmoulckers/jrm-recipes/issues/569)) ([d29d024](https://github.com/jrmoulckers/jrm-recipes/commit/d29d02470e45b3bfbc13f41f63b5bc4ca4bb4df6))
* **ui:** standardize selects, checkboxes, and segmented toggles ([#561](https://github.com/jrmoulckers/jrm-recipes/issues/561)) ([59f43ee](https://github.com/jrmoulckers/jrm-recipes/commit/59f43eed923e20a40f7f32ecc23c33ed7ca9e21f))
* **units:** fully interchangeable per-user units system ([22a96bf](https://github.com/jrmoulckers/jrm-recipes/commit/22a96bfb9ae3c8536e48cea6014792c39c073d6e))


### Bug Fixes

* **a11y:** improve warning text contrast ([#599](https://github.com/jrmoulckers/jrm-recipes/issues/599)) ([#602](https://github.com/jrmoulckers/jrm-recipes/issues/602)) ([3d15dda](https://github.com/jrmoulckers/jrm-recipes/commit/3d15dda6d5ce55d431e71eb1a97f5be63cf9c7bf))
* **brand:** replace legacy app logos ([#607](https://github.com/jrmoulckers/jrm-recipes/issues/607)) ([#610](https://github.com/jrmoulckers/jrm-recipes/issues/610)) ([fce0ab3](https://github.com/jrmoulckers/jrm-recipes/commit/fce0ab3fe971ce3f2332bf852b731c9cc9907951))
* **cron:** cap food-graph maxDuration at 60s so prod deploys on Hobby ([#576](https://github.com/jrmoulckers/jrm-recipes/issues/576)) ([8ecaaf9](https://github.com/jrmoulckers/jrm-recipes/commit/8ecaaf9a15313dfb056401f8e6cc027518dd7291))
* **deps:** override vulnerable nanoid version ([#613](https://github.com/jrmoulckers/jrm-recipes/issues/613)) ([#614](https://github.com/jrmoulckers/jrm-recipes/issues/614)) ([2864077](https://github.com/jrmoulckers/jrm-recipes/commit/2864077ff0151b0b745e0da472f063e8437c3fab))
* **deps:** resolve high-severity npm audit advisories (next, postcss, sharp, brace-expansion) ([6a10b29](https://github.com/jrmoulckers/jrm-recipes/commit/6a10b295a2d8d75427b4406632a76b7be7967dba))
* **editor:** align view toggle colors ([#593](https://github.com/jrmoulckers/jrm-recipes/issues/593)) ([#595](https://github.com/jrmoulckers/jrm-recipes/issues/595)) ([377c31b](https://github.com/jrmoulckers/jrm-recipes/commit/377c31bce3b064e4112d7fb13d536824f539453a))
* **planner:** restore family action parity ([#619](https://github.com/jrmoulckers/jrm-recipes/issues/619)) ([#622](https://github.com/jrmoulckers/jrm-recipes/issues/622)) ([efc8cbc](https://github.com/jrmoulckers/jrm-recipes/commit/efc8cbc93049c9f646f84db94e791b1a6289599f))
* **recipe:** align icons and labels in the More actions menu ([#582](https://github.com/jrmoulckers/jrm-recipes/issues/582)) ([8f1ae15](https://github.com/jrmoulckers/jrm-recipes/commit/8f1ae15ea743703659696751941a025b0fd1f76d))
* **recipe:** align read-aloud control colors ([#598](https://github.com/jrmoulckers/jrm-recipes/issues/598)) ([#601](https://github.com/jrmoulckers/jrm-recipes/issues/601)) ([dd68842](https://github.com/jrmoulckers/jrm-recipes/commit/dd68842d4d258380800f01e40f4c550fec827b60))
* **recipes:** avoid empty catch arrow that fails lint build ([#579](https://github.com/jrmoulckers/jrm-recipes/issues/579)) ([5ac65f9](https://github.com/jrmoulckers/jrm-recipes/commit/5ac65f99cdd6fcefa6c35736312ef7c951dfb43e))
* **recipes:** keep recipe header above cover image ([#597](https://github.com/jrmoulckers/jrm-recipes/issues/597)) ([#600](https://github.com/jrmoulckers/jrm-recipes/issues/600)) ([5625ff8](https://github.com/jrmoulckers/jrm-recipes/commit/5625ff8d1336524fee07c30e9b2d129bfe22d53e))
* **recipes:** move food-graph recompute off the save path to a cron ([#574](https://github.com/jrmoulckers/jrm-recipes/issues/574)) ([#575](https://github.com/jrmoulckers/jrm-recipes/issues/575)) ([3f1e6b1](https://github.com/jrmoulckers/jrm-recipes/commit/3f1e6b1be08fbfe4d67361252ec099127980b0b7))
* **recipes:** never assign a slug that collides with a sibling route ([#572](https://github.com/jrmoulckers/jrm-recipes/issues/572)) ([cf7fc38](https://github.com/jrmoulckers/jrm-recipes/commit/cf7fc38f6d22021d362e2ab10b76867c9b7d947d))
* **recipes:** reduce fallback image blur ([#608](https://github.com/jrmoulckers/jrm-recipes/issues/608)) ([#612](https://github.com/jrmoulckers/jrm-recipes/issues/612)) ([fd8db00](https://github.com/jrmoulckers/jrm-recipes/commit/fd8db001c1b39f3c85ceb60bd95000e81e192c9a))
* **recipes:** resolve food IDs on the save transaction to stop 504s ([#577](https://github.com/jrmoulckers/jrm-recipes/issues/577)) ([9b0356e](https://github.com/jrmoulckers/jrm-recipes/commit/9b0356e85e06198d70de4f2675c8ce5200af9876))
* **recipes:** stop passing render-prop function across the RSC boundary ([#537](https://github.com/jrmoulckers/jrm-recipes/issues/537)) ([5120b54](https://github.com/jrmoulckers/jrm-recipes/commit/5120b5417c04856181ecca87c985d72d977700b4))
* **search:** build search subqueries with QueryBuilder so RQB doesn't crash ([#584](https://github.com/jrmoulckers/jrm-recipes/issues/584)) ([89dd564](https://github.com/jrmoulckers/jrm-recipes/commit/89dd5644c1a8251d43626890dcf519a5e39cd725))
* **ui:** preserve dialog position during pop animation ([#620](https://github.com/jrmoulckers/jrm-recipes/issues/620)) ([#621](https://github.com/jrmoulckers/jrm-recipes/issues/621)) ([c6e6a94](https://github.com/jrmoulckers/jrm-recipes/commit/c6e6a94bf0a411538528e121208e74abfac8a5a2))


### Performance Improvements

* **db:** keep Neon compute warm during peak hours to cut save cold starts ([#580](https://github.com/jrmoulckers/jrm-recipes/issues/580)) ([f779fee](https://github.com/jrmoulckers/jrm-recipes/commit/f779feecadb1b1bcd3079e9c8a2c6f906490880c))
* **recipes:** co-locate functions with Neon + trim save round-trips ([#578](https://github.com/jrmoulckers/jrm-recipes/issues/578)) ([32f7b20](https://github.com/jrmoulckers/jrm-recipes/commit/32f7b20b93db186df6533032b3e700a0c70ee116))

## [0.2.0](https://github.com/jrmoulckers/jrm-recipes/compare/heirloom-v0.1.0...heirloom-v0.2.0) (2026-07-13)


### Features

* **a11y:** accessibility preferences + one-tap Kids mode ([44a91f8](https://github.com/jrmoulckers/jrm-recipes/commit/44a91f88d9e52aac607ed75a0f0c662d16290cbf))
* add "Cooked it" cooking journal ([#10](https://github.com/jrmoulckers/jrm-recipes/issues/10)) ([ae127bc](https://github.com/jrmoulckers/jrm-recipes/commit/ae127bcb78748b6290568882e9c8323166157b92))
* add favorites and collections ([#11](https://github.com/jrmoulckers/jrm-recipes/issues/11)) ([850ed8f](https://github.com/jrmoulckers/jrm-recipes/commit/850ed8fcc0444a4134120f69b2a1518c9e4d11a8))
* **collections:** share a collection with a family group ([#513](https://github.com/jrmoulckers/jrm-recipes/issues/513)) ([f49c1a6](https://github.com/jrmoulckers/jrm-recipes/commit/f49c1a6745acc68afe1b7e5bcda1836153cf0972))
* cook mode, print/share formats, and test+CI backbone ([4a8a869](https://github.com/jrmoulckers/jrm-recipes/commit/4a8a86973b6764bc14b525288270b95b40bfe3ae))
* **cook:** multi/custom timers ([#392](https://github.com/jrmoulckers/jrm-recipes/issues/392)) + mise en place screen ([#402](https://github.com/jrmoulckers/jrm-recipes/issues/402)) ([#509](https://github.com/jrmoulckers/jrm-recipes/issues/509)) ([13abeb9](https://github.com/jrmoulckers/jrm-recipes/commit/13abeb9e8c69645f327e3baf2a58e06cea381c45))
* **cook:** technique tutor with tips in cook mode ([#7](https://github.com/jrmoulckers/jrm-recipes/issues/7)) ([e3cb0b2](https://github.com/jrmoulckers/jrm-recipes/commit/e3cb0b29f8bea4f477eea60babe8d5393b13c46c))
* **engagement:** owner can accept & apply a suggested tweak ([#24](https://github.com/jrmoulckers/jrm-recipes/issues/24)) ([964dc14](https://github.com/jrmoulckers/jrm-recipes/commit/964dc1451eec88d0e83c15e17a2e055746b4a7d9))
* **eng:** optimize barrel imports + i18n catalog tooling ([#508](https://github.com/jrmoulckers/jrm-recipes/issues/508)) ([e03bee6](https://github.com/jrmoulckers/jrm-recipes/commit/e03bee6e7e382b3adef022cbf6212e8cb59a91af))
* Heirloom foundation — Next.js 15 + theming, DB schema, auth, app shell ([fb91532](https://github.com/jrmoulckers/jrm-recipes/commit/fb9153249d5981511174882a844d518c5646fa36))
* **nav:** localize chrome, trim mobile tabs, add breadcrumbs ([#492](https://github.com/jrmoulckers/jrm-recipes/issues/492)) ([1c26ca0](https://github.com/jrmoulckers/jrm-recipes/commit/1c26ca09400bb797eaedaaa1652a9f63ae78cca0))
* Phase 2 - recipe history, adaptations, groups & engagement ([#3](https://github.com/jrmoulckers/jrm-recipes/issues/3)) ([2d4f972](https://github.com/jrmoulckers/jrm-recipes/commit/2d4f9723d7523640f55cb57eb531373a12899d1c))
* **planner:** add weekly meal planner ([#12](https://github.com/jrmoulckers/jrm-recipes/issues/12)) ([006d389](https://github.com/jrmoulckers/jrm-recipes/commit/006d389f2134cc285ec1047e8bbf9d515c50a428))
* **pm:** multi-generation adaptation family tree ([#359](https://github.com/jrmoulckers/jrm-recipes/issues/359)) ([#505](https://github.com/jrmoulckers/jrm-recipes/issues/505)) ([58bca3f](https://github.com/jrmoulckers/jrm-recipes/commit/58bca3f857ac7f757b67fc9a36696ee3e9ee29c4))
* **pm:** recipe version compare + paste-text import (Wave 5 biz-pm) ([#500](https://github.com/jrmoulckers/jrm-recipes/issues/500)) ([502ab26](https://github.com/jrmoulckers/jrm-recipes/commit/502ab26b9be1e1f6a728ba32e7a112c3893a03bb))
* **pwa:** offline fallback page + install prompt ([d850689](https://github.com/jrmoulckers/jrm-recipes/commit/d85068925b7e03fc3af838bff662b9b14d3d8b67))
* **recipes:** branded social share cards + self-healing DB migrations (unblocks prod deploy) ([#16](https://github.com/jrmoulckers/jrm-recipes/issues/16)) ([92e5167](https://github.com/jrmoulckers/jrm-recipes/commit/92e51674833b52e1d1d4d3150b5f741ae432560b))
* **recipes:** complete core recipe loop (view, editor, cook/print) ([bd4cf16](https://github.com/jrmoulckers/jrm-recipes/commit/bd4cf1672566eefd4fb93fe16ad132a5774e985f))
* **recipes:** data layer — units, validation, queries, mutations, seed ([e9abbce](https://github.com/jrmoulckers/jrm-recipes/commit/e9abbced094652dabecdd645d8afbe692fd3beb8))
* **recipes:** interactive technique tutor on the recipe detail page ([#13](https://github.com/jrmoulckers/jrm-recipes/issues/13)) ([6e78d28](https://github.com/jrmoulckers/jrm-recipes/commit/6e78d2885d439490eead544ff660f8711f98cedb))
* **recipes:** paginate library, search, and fix discover load-more ([#518](https://github.com/jrmoulckers/jrm-recipes/issues/518)) ([a69e745](https://github.com/jrmoulckers/jrm-recipes/commit/a69e74500d2de97b2ac2a1e2fee47baf44d6f9d9))
* **recipes:** per-recipe SEO + OpenGraph metadata and Recipe JSON-LD ([#20](https://github.com/jrmoulckers/jrm-recipes/issues/20)) ([0a54d7c](https://github.com/jrmoulckers/jrm-recipes/commit/0a54d7c8793c63a27e9b5b47c93fa508adb7f867))
* shopping aisles, plan-to-list, shared plans, kid-safe, revoke invites ([#360](https://github.com/jrmoulckers/jrm-recipes/issues/360) [#361](https://github.com/jrmoulckers/jrm-recipes/issues/361) [#363](https://github.com/jrmoulckers/jrm-recipes/issues/363) [#367](https://github.com/jrmoulckers/jrm-recipes/issues/367) [#366](https://github.com/jrmoulckers/jrm-recipes/issues/366)) ([#512](https://github.com/jrmoulckers/jrm-recipes/issues/512)) ([64ac94b](https://github.com/jrmoulckers/jrm-recipes/commit/64ac94be5e725f1a4fa65967241eb0bf28acdede))
* shopping list generator with unit-aware aggregation ([#14](https://github.com/jrmoulckers/jrm-recipes/issues/14)) ([4dc1161](https://github.com/jrmoulckers/jrm-recipes/commit/4dc1161085f899c7c32e74277abc4884ea2954fd))
* smart ingredient substitutions and scaling nudges ([#9](https://github.com/jrmoulckers/jrm-recipes/issues/9)) ([5229970](https://github.com/jrmoulckers/jrm-recipes/commit/522997060db3bfb31351c4d75127fa278bb79491))


### Bug Fixes

* **a11y:** restore visible keyboard focus ring on Button ([#461](https://github.com/jrmoulckers/jrm-recipes/issues/461)) ([2d92448](https://github.com/jrmoulckers/jrm-recipes/commit/2d92448e675d2404d03b98c37bf3d93e71efab7b)), closes [#113](https://github.com/jrmoulckers/jrm-recipes/issues/113)
* **build:** repair main after [#504](https://github.com/jrmoulckers/jrm-recipes/issues/504) — App Router router.push string href, ESLint, bundle budget ([#506](https://github.com/jrmoulckers/jrm-recipes/issues/506)) ([5a9f526](https://github.com/jrmoulckers/jrm-recipes/commit/5a9f5268a1d263f564b7d670137efcec806dc840))
* **ci:** format codebase with prettier and fix .next artifact upload ([#520](https://github.com/jrmoulckers/jrm-recipes/issues/520)) ([4541c1b](https://github.com/jrmoulckers/jrm-recipes/commit/4541c1bddb8618b6d425cd06b98f41d44dc5c0cc))
* **ci:** restore green CI + healthy deploy after the Actions billing stoppage ([#519](https://github.com/jrmoulckers/jrm-recipes/issues/519)) ([3e2d185](https://github.com/jrmoulckers/jrm-recipes/commit/3e2d185a2e418fad475902161d7df00cdc92562e))
* **db:** reconcile prod schema missing migration 0011 ([#522](https://github.com/jrmoulckers/jrm-recipes/issues/522)) ([1af94fb](https://github.com/jrmoulckers/jrm-recipes/commit/1af94fb0e9a1efa1d2f952ee303b756947d2df6f))
* **deploy:** run migrations over a direct (non-pooled) connection ([13679b5](https://github.com/jrmoulckers/jrm-recipes/commit/13679b52118ebcf07a5b9a0f84aad1c726758b19))
* **deploy:** run migrations over direct (non-pooled) connection ([a630fbd](https://github.com/jrmoulckers/jrm-recipes/commit/a630fbdd422231b92829a139790e9df6b2b066ec))
* **deps:** repair broken pnpm-lock after back-to-back dependabot merges ([#531](https://github.com/jrmoulckers/jrm-recipes/issues/531)) ([d53b770](https://github.com/jrmoulckers/jrm-recipes/commit/d53b77011a1c3f513177ead3401566d31122f423))
* four persona-sim bug fixes ([#61](https://github.com/jrmoulckers/jrm-recipes/issues/61) [#63](https://github.com/jrmoulckers/jrm-recipes/issues/63) [#64](https://github.com/jrmoulckers/jrm-recipes/issues/64) [#65](https://github.com/jrmoulckers/jrm-recipes/issues/65)) ([#515](https://github.com/jrmoulckers/jrm-recipes/issues/515)) ([2161f33](https://github.com/jrmoulckers/jrm-recipes/commit/2161f33211ca23ffff67d3d3eaed9c516c0e0176))
* group role authorization + group-visibility integrity ([#42](https://github.com/jrmoulckers/jrm-recipes/issues/42)) ([176a84d](https://github.com/jrmoulckers/jrm-recipes/commit/176a84dc0f1bf48440739558f92ff4e00db24ccd))
* nav landmark labels, aria-current, and accessible theme picker ([#49](https://github.com/jrmoulckers/jrm-recipes/issues/49)) ([f988633](https://github.com/jrmoulckers/jrm-recipes/commit/f988633034c4a541066d276c815d4a2e7033dd02))
* **pm:** Wave 5 biz-pm gate remediation - step-diff, lint, and bundle budgets (follow-up to [#500](https://github.com/jrmoulckers/jrm-recipes/issues/500)) ([#503](https://github.com/jrmoulckers/jrm-recipes/issues/503)) ([a092f39](https://github.com/jrmoulckers/jrm-recipes/commit/a092f39f3ca1f629c4b0c4e20e793642614caf8f))
* public recipe pages leak private forks (lineage + timeline) ([#41](https://github.com/jrmoulckers/jrm-recipes/issues/41)) ([d9474f7](https://github.com/jrmoulckers/jrm-recipes/commit/d9474f7fe52051b07ce77f17b68989129a5a5071))
* ratings integrity (no self-rating) + global count-aware top-rated ([#46](https://github.com/jrmoulckers/jrm-recipes/issues/46)) ([57d0983](https://github.com/jrmoulckers/jrm-recipes/commit/57d098354ba94a31574a87f8a7cf6488731e41e6))
* **recipe-editor:** stop iOS zoom-on-focus for native selects ([#449](https://github.com/jrmoulckers/jrm-recipes/issues/449)) ([57c34f1](https://github.com/jrmoulckers/jrm-recipes/commit/57c34f159705b1133a91e0ede84c9b96baf33f40)), closes [#287](https://github.com/jrmoulckers/jrm-recipes/issues/287)
* shopping-list categorization, optional flag, and unknown-category fallback ([#47](https://github.com/jrmoulckers/jrm-recipes/issues/47)) ([54c29b7](https://github.com/jrmoulckers/jrm-recipes/commit/54c29b7c2b46731e873cae4cde02c712654b0dda))
* **theme:** restore previous UI mode when Kids mode is turned off ([#448](https://github.com/jrmoulckers/jrm-recipes/issues/448)) ([53d6617](https://github.com/jrmoulckers/jrm-recipes/commit/53d66176b648e8a13b3d77b1bf2d190fad9da706)), closes [#428](https://github.com/jrmoulckers/jrm-recipes/issues/428)
* WCAG AA contrast for themed buttons, nav labels, and borders ([#48](https://github.com/jrmoulckers/jrm-recipes/issues/48)) ([270d16c](https://github.com/jrmoulckers/jrm-recipes/commit/270d16cd667c842ab675e95c0608b6be2682bf45))


### Performance Improvements

* engineering-performance batch (rendering, bundle, caching, CI gates) ([#478](https://github.com/jrmoulckers/jrm-recipes/issues/478)) ([73e4728](https://github.com/jrmoulckers/jrm-recipes/commit/73e4728d196f80e3e860d1ddf05b638d1d512456))
* prioritize first-row recipe grid images for LCP ([#458](https://github.com/jrmoulckers/jrm-recipes/issues/458)) ([603eb0a](https://github.com/jrmoulckers/jrm-recipes/commit/603eb0ae8771a343832d30caee926bb3c07bda82)), closes [#191](https://github.com/jrmoulckers/jrm-recipes/issues/191)
* **pwa:** durably cache Cook Mode images for offline & repeat visits ([#463](https://github.com/jrmoulckers/jrm-recipes/issues/463)) ([e4a86cc](https://github.com/jrmoulckers/jrm-recipes/commit/e4a86cc41ff6f03bb538ed00606066f26ff3aac6)), closes [#209](https://github.com/jrmoulckers/jrm-recipes/issues/209)

## 0.1.0

- Initial baseline. Automated versioning, changelog, and release tagging begin
  from this version; future entries are generated on merge to `main`.
