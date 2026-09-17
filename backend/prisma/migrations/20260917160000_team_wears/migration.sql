-- Team Wears: one apparel group holding Soccer Uniforms, Tracksuits and
-- Football Socks.
--
-- The category tree is one level deep on purpose, so the ten kit types cannot
-- stay as categories under Soccer Uniforms once Soccer Uniforms sits under
-- Team Wears. Each kit therefore moves into Soccer Uniforms carrying its type
-- in "usage" — the field the product page shows as "Intended use" and the
-- filters already read — and the emptied type categories are removed.
--
-- Written to be safe to run twice: the inserts skip what exists, the updates
-- set the same values again, and the delete finds nothing the second time.

INSERT INTO "Category" ("id", "name", "slug", "shortDescription", "description", "image", "displayOrder", "active", "footballRange", "metaTitle", "metaDescription", "updatedAt")
VALUES (
  'cat_team_wears',
  'Team Wears',
  'team-wears',
  'Custom soccer uniforms, tracksuits and football socks for clubs, academies and teams.',
  'Custom team wear made to order by WIN WEARS: soccer uniforms, tracksuits and football socks for football clubs, academies, teams and tournaments. Choose your colours, crest, sponsors, names and numbers.',
  '/assets/img/uniforms/kits/design-33/1.jpg',
  90,
  true,
  false,
  'Team Wear Manufacturer | WIN WEARS',
  'Custom team wear by WIN WEARS: soccer uniforms, tracksuits and football socks for football clubs, academies, teams and tournaments. Bulk orders and customization available.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

-- Every kit moves into Soccer Uniforms, keeping its type on the product.
UPDATE "Product" p
SET "categoryId" = (SELECT "id" FROM "Category" WHERE "slug" = 'soccer-uniforms'),
    "usage" = COALESCE(p."usage", c."name"),
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Category" c
WHERE p."categoryId" = c."id"
  AND c."parentId" = (SELECT "id" FROM "Category" WHERE "slug" = 'soccer-uniforms')
  AND c."slug" <> 'football-socks';

-- The three categories customers choose between.
UPDATE "Category"
SET "parentId" = (SELECT "id" FROM "Category" WHERE "slug" = 'team-wears'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN ('soccer-uniforms', 'tracksuits', 'football-socks');

-- The emptied kit-type categories. Their type lives on each product now.
DELETE FROM "Category"
WHERE "parentId" = (SELECT "id" FROM "Category" WHERE "slug" = 'soccer-uniforms')
  AND "slug" <> 'football-socks';
