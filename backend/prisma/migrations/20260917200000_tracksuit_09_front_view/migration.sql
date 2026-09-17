-- Correcting the previous migration: the photo it promoted, 3.jpg, is the back
-- of the jacket. 2.jpg is the front — quarter-zip, crest and sponsor visible —
-- which is the view the other fifteen tracksuit cards show.
--
-- Guarded on 3.jpg still being the primary, so this runs once and leaves a
-- choice made in the admin dashboard alone.

WITH target AS (
  SELECT p."id"
  FROM "Product" p
  WHERE p."slug" = 'custom-training-tracksuit-black-ww-ts-09'
    AND EXISTS (
      SELECT 1 FROM "ProductImage" i
      WHERE i."productId" = p."id"
        AND i."url" = '/assets/img/tracksuits/design-09/3.jpg'
        AND i."isPrimary"
    )
)
UPDATE "ProductImage" i
SET "type" = CASE WHEN i."url" LIKE '%/design-09/2.jpg' THEN 'MAIN'::"ImageType" ELSE 'GALLERY'::"ImageType" END,
    "isPrimary" = (i."url" LIKE '%/design-09/2.jpg'),
    "displayOrder" = CASE WHEN i."url" LIKE '%/design-09/2.jpg' THEN 0 ELSE 1 END,
    "altText" = CASE
      WHEN i."url" LIKE '%/design-09/2.jpg' THEN 'WIN WEARS Custom Training Tracksuit — Black'
      ELSE 'WIN WEARS Custom Training Tracksuit — Black — back view'
    END
FROM target t
WHERE i."productId" = t."id"
  AND i."url" IN ('/assets/img/tracksuits/design-09/2.jpg', '/assets/img/tracksuits/design-09/3.jpg');
