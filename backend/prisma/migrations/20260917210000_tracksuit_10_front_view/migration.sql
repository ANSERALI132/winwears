-- The white and blue tracksuit led with the back of the jacket, so its card
-- showed no zip, crest or sponsor. 2.jpg is the front view, matching every
-- other tracksuit card.
--
-- Guarded on 1.jpg still being the primary, so this runs once and a primary
-- chosen in the admin dashboard is left alone.

WITH target AS (
  SELECT p."id"
  FROM "Product" p
  WHERE p."slug" = 'custom-training-tracksuit-white-blue-ww-ts-10'
    AND EXISTS (
      SELECT 1 FROM "ProductImage" i
      WHERE i."productId" = p."id"
        AND i."url" = '/assets/img/tracksuits/design-10/1.jpg'
        AND i."isPrimary"
    )
)
UPDATE "ProductImage" i
SET "type" = CASE WHEN i."url" LIKE '%/design-10/2.jpg' THEN 'MAIN'::"ImageType" ELSE 'GALLERY'::"ImageType" END,
    "isPrimary" = (i."url" LIKE '%/design-10/2.jpg'),
    "displayOrder" = CASE WHEN i."url" LIKE '%/design-10/2.jpg' THEN 0 ELSE 1 END,
    "altText" = CASE
      WHEN i."url" LIKE '%/design-10/2.jpg' THEN 'WIN WEARS Custom Training Tracksuit — White · Blue'
      ELSE 'WIN WEARS Custom Training Tracksuit — White · Blue — back view'
    END
FROM target t
WHERE i."productId" = t."id"
  AND i."url" IN ('/assets/img/tracksuits/design-10/1.jpg', '/assets/img/tracksuits/design-10/2.jpg');
