-- Soccer Uniforms had no cover photograph of its own: the covers belonged to
-- the kit types, which are gone now that every kit sits in Soccer Uniforms
-- directly, so its card fell back to the drawn kit artwork.
--
-- Only fills an empty image, so a photo chosen in the admin is left alone.

UPDATE "Category"
SET "image" = '/assets/img/uniforms/kits/design-21/1.jpg', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'soccer-uniforms' AND "image" IS NULL;
