-- The Team Wears cover becomes WIN WEARS' own kit mockup — jersey, shorts and
-- socks in our branding — instead of the kit photo it borrowed from Soccer
-- Uniforms.
--
-- Only the value this project set is replaced, so a cover chosen in the admin
-- dashboard survives, and running the migration twice changes nothing.

UPDATE "Category"
SET "image" = '/assets/img/uniforms/team-wears-hero.jpg',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'team-wears'
  AND ("image" IS NULL OR "image" = '/assets/img/uniforms/kits/design-33/1.jpg');
