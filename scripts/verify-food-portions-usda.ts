/**
 * Reproduce the USDA validation behind `src/lib/food-portions.ts` (#1030).
 *
 * Download and extract the FoodData Central SR Legacy 2018-04 CSV archive, then:
 *
 *   pnpm verify:food-portions <path-to-food_portion.csv>
 *
 * The upstream dataset is intentionally not vendored. This compact manifest
 * records the exact FDC row, any normalization to one app unit, and the observed
 * gram weight. The archive and extracted CSV hashes below pin the source bytes.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { allPortions } from '../src/lib/food-portions';

export const USDA_PORTION_SOURCE = {
  release: 'FoodData Central SR Legacy 2018-04',
  url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
  archiveSha256: 'b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0',
  foodPortionCsvSha256: '6332e29da61e13f7bd950b759461af73303c76e8b0e64dc9df4e41d5347cf3d1',
} as const;

/**
 * A difference is material when it exceeds both kitchen-scale repeatability
 * (2 g) and 10% of the USDA reference, or when it exceeds 50% at any size. The
 * extreme-relative guard catches a doubled herb weight while the two-part
 * normal threshold avoids treating harmless tenths of a gram as exact science.
 */
export const USDA_MATERIAL_DIFFERENCE = {
  absoluteGrams: 2,
  relative: 0.1,
  extremeRelative: 0.5,
} as const;

type UsdaReference = {
  slug: string;
  unit: string;
  fdcId: number;
  portionId: number;
  gramFactor: number;
  referenceGrams: number;
};

const REFERENCE_ROWS = `
onion each 170000 85860 1 110
onion cup 170000 85855 1 160
garlic clove 169230 84480 1 3
garlic each 169230 84480 1 3
garlic tsp 169230 84479 1 2.8
potato each 170026 85919 1 213
potato cup 170026 85917 2 150
sweet-potato each 168482 83167 1 130
sweet-potato cup 168482 83166 1 133
carrot each 170393 86559 1 61
carrot cup 170393 86555 1 128
tomato each 170457 86686 1 123
tomato cup 170457 86682 1 180
bell-pepper each 170108 86066 1 119
bell-pepper cup 170108 86062 1 149
cucumber each 168409 83050 1 301
cucumber cup 168409 83049 2 104
zucchini each 169291 84610 1 196
zucchini cup 169291 84607 1 124
eggplant each 169228 84475 1 458
eggplant cup 169228 84474 1 82
avocado each 171705 89226 1 201
avocado cup 171705 89225 1 146
mushroom each 169251 84529 1 18
mushroom cup 169251 84526 1 70
celery each 169988 85828 1 40
celery stalk 169988 85828 1 40
celery cup 169988 85824 1 101
corn each 169998 85848 1 102
corn ear 169998 85848 1 102
corn cup 169998 85846 1 145
broccoli cup 170379 86528 1 91
cauliflower each 169986 85821 1 588
cauliflower head 169986 85821 1 588
cauliflower cup 169986 85818 1 107
squash each 170487 86747 1 196
squash cup 170487 86745 1 113
leek each 169246 84504 1 89
leek cup 169246 84503 1 89
ginger tsp 169231 84482 1 2
apple each 171688 89193 1 182
apple cup 171688 89190 1 125
banana each 173944 93515 1 118
banana cup 173944 93512 1 150
lemon each 167746 81883 1 58
lemon tbsp 167747 81887 0.0625 15.25
lime each 168155 82570 1 67
lime tbsp 168156 82572 0.0625 15.125
orange each 169097 84230 1 131
orange cup 169097 84227 1 180
mango each 169910 85652 1 336
mango cup 169910 85651 1 165
pineapple each 169124 84288 1 905
pineapple cup 169124 84287 1 165
peach each 169928 85699 1 150
peach cup 169928 85697 1 154
berries cup 167762 81922 1 144
grapes cup 174683 94748 1 151
grapes each 174683 94749 0.1 4.9
raisins cup 168165 82587 1 165
raisins tbsp 168165 82587 0.0625 10.3125
spinach cup 168462 83132 1 30
spinach bunch 168462 83133 1 340
lettuce cup 169247 84506 1 47
lettuce each 168431 83087 1 309
lettuce head 168431 83087 1 309
kale cup 168421 83066 1 21
cabbage cup 169975 85791 1 89
cabbage each 169975 85795 1 908
cabbage head 169975 85795 1 908
arugula cup 169387 84771 2 20
chard cup 169991 85834 1 36
basil tbsp 172232 90126 0.5 2.65
basil tsp 172232 90126 0.1666666667 0.8833333333
basil cup 172232 90127 4 24
parsley tbsp 170416 86608 1 3.8
parsley tsp 170416 86608 0.3333333333 1.2666666667
parsley cup 170416 86607 1 60
cilantro tbsp 169997 85844 0.25 1
cilantro tsp 169997 85844 0.0833333333 0.3333333333
cilantro cup 169997 85844 4 16
mint tbsp 173474 92611 0.5 1.6
mint tsp 173474 92611 0.1666666667 0.5333333333
mint cup 173474 92611 8 25.6
thyme tsp 173470 92601 1 0.8
thyme tbsp 173470 92601 3 2.4
rosemary tsp 173473 92608 1 0.7
rosemary tbsp 173473 92609 1 1.7
oregano tsp 171328 88445 1 1
oregano tbsp 171328 88445 3 3
dill tbsp 172233 90129 0.0625 0.55625
dill tsp 172233 90129 0.0208333333 0.1854166664
dill cup 172233 90129 1 8.9
sage tsp 170935 87570 1 0.7
sage tbsp 170935 87571 1 2
chives tbsp 169994 85839 1 3
chives tsp 169994 85840 1 1
black-pepper tsp 170931 87560 1 2.3
black-pepper tbsp 170931 87561 1 6.9
cinnamon tsp 171320 88429 1 2.6
cinnamon tbsp 171320 88430 1 7.8
cumin tsp 170923 87544 1 2.1
cumin tbsp 170923 87545 1 6
paprika tsp 171329 88447 1 2.3
paprika tbsp 171329 88448 1 6.8
chili-powder tsp 171319 88427 1 2.7
chili-powder tbsp 171319 88428 1 8
turmeric tsp 172231 90123 1 3
turmeric tbsp 172231 90124 1 9.4
nutmeg tsp 171326 88441 1 2.2
nutmeg tbsp 171326 88442 1 7
ground-ginger tsp 170926 87550 1 1.8
ground-ginger tbsp 170926 87551 1 5.2
curry-powder tsp 170924 87546 1 2
curry-powder tbsp 170924 87547 1 6.3
garlic-powder tsp 171325 88439 1 3.1
garlic-powder tbsp 171325 88440 1 9.7
vanilla tsp 173471 92603 1 4.2
vanilla tbsp 173471 92604 1 13
cloves tsp 171321 88431 1 2.1
cloves tbsp 171321 88432 1 6.5
ground-coriander tsp 170922 87542 1 1.8
ground-coriander tbsp 170922 87543 1 5
egg each 171287 88374 1 50
egg cup 171287 88377 1 243
egg-white each 172183 90043 1 33
egg-yolk each 172184 90045 1 17
cheese cup 173414 92469 1 113
cheese tbsp 173414 92469 0.0625 7.0625
cheese tsp 173414 92469 0.0208333333 2.3541666629
cheese slice 173414 92472 1 28
pasta cup 168927 84005 1 96
beans can 174285 94082 1 266
chickpeas can 173800 93273 1 253
shrimp each 174210 93942 0.25 7
scallops each 174220 93964 0.5 15
mussels each 174216 93958 1 10
`;

export const USDA_PORTION_REFERENCES: readonly UsdaReference[] = REFERENCE_ROWS.trim()
  .split('\n')
  .map((line) => {
    const [slug, unit, fdcId, portionId, gramFactor, referenceGrams] = line.trim().split(/\s+/);
    if (!slug || !unit || !fdcId || !portionId || !gramFactor || !referenceGrams) {
      throw new Error(`Invalid USDA reference row: ${line}`);
    }
    return {
      slug,
      unit,
      fdcId: Number(fdcId),
      portionId: Number(portionId),
      gramFactor: Number(gramFactor),
      referenceGrams: Number(referenceGrams),
    };
  });

export function isMaterialDifference(actualGrams: number, referenceGrams: number): boolean {
  const absolute = Math.abs(actualGrams - referenceGrams);
  const relative = absolute / referenceGrams;
  return (
    relative > USDA_MATERIAL_DIFFERENCE.extremeRelative ||
    (absolute >= USDA_MATERIAL_DIFFERENCE.absoluteGrams &&
      relative > USDA_MATERIAL_DIFFERENCE.relative)
  );
}

export function auditRecordedUsdaReferences(): string[] {
  const errors: string[] = [];
  const references = new Map(
    USDA_PORTION_REFERENCES.map((reference) => [`${reference.slug}|${reference.unit}`, reference]),
  );

  for (const { slug, portion } of allPortions()) {
    const key = `${slug}|${portion.unit}`;
    const reference = references.get(key);
    if (portion.source === 'usda' && !reference) {
      errors.push(`${key} is labelled usda but has no recorded USDA row`);
      continue;
    }
    if (portion.source === 'kitchen' && reference) {
      errors.push(`${key} is labelled kitchen but still has a USDA reference`);
      continue;
    }
    if (reference && isMaterialDifference(portion.gramsPerUnit, reference.referenceGrams)) {
      errors.push(
        `${key} is ${portion.gramsPerUnit} g; USDA reference is ${reference.referenceGrams} g`,
      );
    }
    references.delete(key);
  }

  for (const key of references.keys()) {
    errors.push(`${key} has a USDA reference but no curated portion`);
  }
  return errors;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

export async function auditUpstreamCsv(filePath: string): Promise<string[]> {
  const contents = await readFile(filePath);
  const checksum = createHash('sha256').update(contents).digest('hex');
  const errors =
    checksum === USDA_PORTION_SOURCE.foodPortionCsvSha256
      ? auditRecordedUsdaReferences()
      : [
          `food_portion.csv SHA-256 is ${checksum}, expected ${USDA_PORTION_SOURCE.foodPortionCsvSha256}`,
        ];
  const lines = contents.toString('utf8').split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift()!);
  const idIndex = headers.indexOf('id');
  const fdcIdIndex = headers.indexOf('fdc_id');
  const gramsIndex = headers.indexOf('gram_weight');
  if ([idIndex, fdcIdIndex, gramsIndex].includes(-1)) {
    return ['CSV is not a FoodData Central food_portion.csv'];
  }

  const rows = new Map(
    lines.map((line) => {
      const fields = parseCsvLine(line);
      return [
        Number(fields[idIndex]),
        {
          fdcId: Number(fields[fdcIdIndex]),
          grams: Number(fields[gramsIndex]),
        },
      ] as const;
    }),
  );

  for (const reference of USDA_PORTION_REFERENCES) {
    const row = rows.get(reference.portionId);
    const key = `${reference.slug}|${reference.unit}`;
    if (!row) {
      errors.push(`${key}: USDA portion ${reference.portionId} is missing`);
    } else if (row.fdcId !== reference.fdcId) {
      errors.push(`${key}: USDA portion belongs to FDC ${row.fdcId}, not ${reference.fdcId}`);
    } else {
      const normalized = row.grams * reference.gramFactor;
      if (Math.abs(normalized - reference.referenceGrams) > 0.000001) {
        errors.push(
          `${key}: normalized USDA weight is ${normalized} g, not ${reference.referenceGrams} g`,
        );
      }
    }
  }
  return errors;
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error('Usage: pnpm verify:food-portions <path-to-food_portion.csv>');
  }
  const errors = await auditUpstreamCsv(filePath);
  if (errors.length > 0) {
    throw new Error(`USDA portion validation failed:\n- ${errors.join('\n- ')}`);
  }
  console.log(
    `Validated ${USDA_PORTION_REFERENCES.length} USDA portions against ${USDA_PORTION_SOURCE.release}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
