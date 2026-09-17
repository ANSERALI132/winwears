-- The black tracksuit led with a close-up of the trouser fabric, so its card
-- showed cloth rather than the suit. Its third photo is the front view of the
-- jacket and trousers together, which is what every other tracksuit card
-- shows, so the two swap places.
--
-- Keyed on the image urls and setting fixed values, so running it again is a
-- no-op and a different primary chosen in the admin dashboard is left alone
-- (the guard below only acts while 1.jpg is still the primary).

WITH target AS (
  SELECT p."id"
  FROM "Product" p
  WHERE p."slug" = 'custom-training-tracksuit-black-ww-ts-09'
    AND EXISTS (
      SELECT 1 FROM "ProductImage" i
      WHERE i."productId" = p."id"
        AND i."url" = '/assets/img/tracksuits/design-09/1.jpg'
        AND i."isPrimary"
    )
)
UPDATE "ProductImage" i
SET "type" = CASE WHEN i."url" LIKE '%/design-09/3.jpg' THEN 'MAIN'::"ImageType" ELSE 'GALLERY'::"ImageType" END,
    "isPrimary" = (i."url" LIKE '%/design-09/3.jpg'),
    "displayOrder" = CASE WHEN i."url" LIKE '%/design-09/3.jpg' THEN 0 ELSE 2 END,
    "altText" = CASE
      WHEN i."url" LIKE '%/design-09/3.jpg' THEN 'WIN WEARS Custom Training Tracksuit — Black'
      ELSE 'WIN WEARS Custom Training Tracksuit — Black — trouser fabric detail'
    END
FROM target t
WHERE i."productId" = t."id"
  AND i."url" IN ('/assets/img/tracksuits/design-09/1.jpg', '/assets/img/tracksuits/design-09/3.jpg');
