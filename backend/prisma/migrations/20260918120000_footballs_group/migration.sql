-- Footballs: one group holding the four ball ranges, as Team Wears holds the
-- apparel, so the homepage shows two cards.
--
-- The group itself is not a ball range (footballRange false): the customiser
-- and the Football Collection list the ranges by that flag, and a group holds
-- no products of its own.
--
-- The ranges also get their photos as covers. They had none, and the page of
-- range cards would otherwise draw its placeholder artwork. Only an empty
-- cover is filled, and only a range with no parent is moved, so a choice made
-- in the admin dashboard survives and running this twice changes nothing.

INSERT INTO "Category" ("id", "name", "slug", "shortDescription", "description", "image", "displayOrder", "active", "footballRange", "metaTitle", "metaDescription", "updatedAt")
VALUES (
  'cat_footballs',
  'Footballs',
  'footballs',
  'Match, training and TPU footballs for clubs, academies, federations and distributors.',
  'Hybrid pro, hand-made, thermal-bonded and TPU footballs manufactured by WIN WEARS for clubs, academies, federations, tournaments and distributors, with your brand on every panel.',
  '/assets/img/products/hybrid/hyb-02/1.jpeg',
  0,
  true,
  false,
  'Custom Football Manufacturer | WIN WEARS',
  'Custom footballs by WIN WEARS: hybrid pro, hand-made, thermal-bonded and TPU balls for clubs, academies, federations, tournaments and distributors. Private label and bulk orders.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

UPDATE "Category"
SET "parentId" = (SELECT "id" FROM "Category" WHERE "slug" = 'footballs'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN ('hybrid-pro-match-ball', 'hand-made-match-ball', 'thermal-bonded-match-ball', 'tpu-ball')
  AND "parentId" IS NULL;

UPDATE "Category"
SET "image" = CASE "slug"
      WHEN 'hybrid-pro-match-ball' THEN '/assets/img/products/hybrid/hyb-02/1.jpeg'
      WHEN 'hand-made-match-ball' THEN '/assets/img/products/handmade/hm-04/1.jpeg'
      WHEN 'thermal-bonded-match-ball' THEN '/assets/img/products/thermal/tb-01/1.jpeg'
      WHEN 'tpu-ball' THEN '/assets/img/products/tpu/tpu-01/1.jpeg'
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN ('hybrid-pro-match-ball', 'hand-made-match-ball', 'thermal-bonded-match-ball', 'tpu-ball')
  AND "image" IS NULL;
