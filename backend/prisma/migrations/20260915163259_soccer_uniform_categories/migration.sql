-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Soccer Uniforms and its ten kit types.
--
-- Shipped as data in a migration rather than in the seed, because the live
-- site runs `prisma migrate deploy` on every build and never seeds. ON CONFLICT
-- DO NOTHING leaves any slug that already exists exactly as it is, so nothing
-- edited in the admin is ever overwritten. Images are left empty on purpose:
-- they are set per category in the admin, and the site shows a kit graphic in
-- the brand colours until one is.

INSERT INTO "Category" ("id", "name", "slug", "shortDescription", "description", "displayOrder", "active", "metaTitle", "metaDescription", "updatedAt")
VALUES (
  'cat_soccer_uniforms',
  'Soccer Uniforms',
  'soccer-uniforms',
  'Premium customized football uniforms made for clubs, academies, teams, and tournaments.',
  'Premium customized football uniforms made for clubs, academies, teams, and tournaments. Choose your style, colors, logos, and designs. Bulk orders and customization available.',
  100,
  true,
  'WIN WEARS | Premium Custom Soccer Uniforms & Football Kits',
  'WIN WEARS offers premium customized soccer uniforms, football kits, academy kits, goalkeeper kits, and team sportswear. Bulk orders and customization available.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "Category" ("id", "name", "slug", "shortDescription", "description", "displayOrder", "active", "metaTitle", "metaDescription", "parentId", "updatedAt")
SELECT
  v.id,
  v.name,
  v.slug,
  v.short,
  v.description,
  v.ord,
  true,
  v.name || ' | WIN WEARS',
  v.short || ' Bulk orders and customization available from WIN WEARS.',
  (SELECT "id" FROM "Category" WHERE "slug" = 'soccer-uniforms'),
  CURRENT_TIMESTAMP
FROM (VALUES
  ('cat_club_football_kits', 'Club Football Kits', 'club-football-kits',
   'Professional club football uniforms, made as full jersey and shorts sets.',
   'Professional club football uniforms. Customized team kits. Full football jersey and shorts.', 101),
  ('cat_academy_football_kits', 'Academy Football Kits', 'academy-football-kits',
   'Soccer academy uniforms, youth football kits and training academy kits.',
   'Soccer academy uniforms. Youth football kits. Training academy kits.', 102),
  ('cat_custom_soccer_jerseys', 'Custom Soccer Jerseys', 'custom-soccer-jerseys',
   'Fully customized football jerseys with team and player names, player numbers, club logos and sponsor logos.',
   'Fully customized football jerseys. Team name and player name. Player numbers. Club logos and sponsor logos.', 103),
  ('cat_football_shorts', 'Football Shorts', 'football-shorts',
   'Matching football shorts, custom team shorts and professional match shorts.',
   'Matching football shorts. Custom team shorts. Professional match shorts.', 104),
  ('cat_football_socks', 'Football Socks', 'football-socks',
   'Matching, team-colored soccer socks to complete the uniform.',
   'Matching soccer socks. Team-colored football socks. Custom football uniform accessories.', 105),
  ('cat_goalkeeper_kits', 'Goalkeeper Kits', 'goalkeeper-kits',
   'Professional goalkeeper jerseys, shorts and socks, or full goalkeeper uniform sets.',
   'Professional goalkeeper jerseys. Goalkeeper shorts. Goalkeeper socks. Full goalkeeper uniform sets.', 106),
  ('cat_football_training_kits', 'Football Training Kits', 'football-training-kits',
   'Team and academy training uniforms, practice jerseys and shorts.',
   'Team training uniforms. Academy training kits. Practice jerseys and shorts.', 107),
  ('cat_football_match_kits', 'Football Match Kits', 'football-match-kits',
   'Home, away and third football kits, and full match uniform sets.',
   'Home football kits. Away football kits. Third football kits. Full match uniform sets.', 108),
  ('cat_kids_youth_football_kits', 'Kids & Youth Football Kits', 'kids-youth-football-kits',
   'Youth soccer uniforms, kids football jerseys and junior academy kits.',
   'Youth soccer uniforms. Kids football jerseys. Junior academy kits.', 109),
  ('cat_custom_team_uniforms', 'Custom Team Uniforms', 'custom-team-uniforms',
   'Fully customized football kits for club and academy orders, with bulk customization and team-specific designs.',
   'Fully customized football kits. Club and academy orders. Bulk order customization. Team-specific designs.', 110)
) AS v(id, name, slug, short, description, ord)
ON CONFLICT ("slug") DO NOTHING;
