-- The WIN WEARS kit designs, published under the soccer uniform categories.
--
-- One product per photographed design, numbered by its source folder, quote
-- only, no price, no invented specification. ON CONFLICT DO NOTHING skips any
-- design whose slug or SKU already exists, so this can neither overwrite an
-- admin edit nor fail a deploy. Category covers are only filled where the
-- category has no image yet.

INSERT INTO "Product" ("id", "productName", "slug", "sku", "shortDescription", "categoryId", "status", "featured", "displayOrder", "customizationAvailable", "quoteOnly", "publishedAt", "updatedAt")
SELECT v.id, v.name, v.slug, v.sku, v.design, c."id", 'PUBLISHED'::"ProductStatus", false, v.ord, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('prod_kit_01', 'WIN WEARS Custom Club Football Kit', 'custom-club-football-kit-design-01-ww-kit-01', 'WW-KIT-01', 'Design 01', 'club-football-kits', 1),
  ('prod_kit_02', 'WIN WEARS Professional Match Kit', 'professional-match-kit-design-02-ww-kit-02', 'WW-KIT-02', 'Design 02', 'football-match-kits', 2),
  ('prod_kit_03', 'WIN WEARS Academy Soccer Uniform', 'academy-soccer-uniform-design-03-ww-kit-03', 'WW-KIT-03', 'Design 03', 'academy-football-kits', 3),
  ('prod_kit_04', 'WIN WEARS Training Football Kit', 'training-football-kit-design-04-ww-kit-04', 'WW-KIT-04', 'Design 04', 'football-training-kits', 4),
  ('prod_kit_05', 'WIN WEARS Custom Goalkeeper Kit', 'custom-goalkeeper-kit-design-05-ww-kit-05', 'WW-KIT-05', 'Design 05', 'goalkeeper-kits', 5),
  ('prod_kit_06', 'WIN WEARS Youth Soccer Uniform', 'youth-soccer-uniform-design-06-ww-kit-06', 'WW-KIT-06', 'Design 06', 'kids-youth-football-kits', 6),
  ('prod_kit_07', 'WIN WEARS Custom Team Uniform', 'custom-team-uniform-design-07-ww-kit-07', 'WW-KIT-07', 'Design 07', 'custom-team-uniforms', 7),
  ('prod_kit_08', 'WIN WEARS Custom Club Football Kit', 'custom-club-football-kit-design-08-ww-kit-08', 'WW-KIT-08', 'Design 08', 'club-football-kits', 8),
  ('prod_kit_09', 'WIN WEARS Professional Match Kit', 'professional-match-kit-design-09-ww-kit-09', 'WW-KIT-09', 'Design 09', 'football-match-kits', 9),
  ('prod_kit_10', 'WIN WEARS Academy Soccer Uniform', 'academy-soccer-uniform-design-10-ww-kit-10', 'WW-KIT-10', 'Design 10', 'academy-football-kits', 10),
  ('prod_kit_11', 'WIN WEARS Training Football Kit', 'training-football-kit-design-11-ww-kit-11', 'WW-KIT-11', 'Design 11', 'football-training-kits', 11),
  ('prod_kit_12', 'WIN WEARS Youth Soccer Uniform', 'youth-soccer-uniform-design-12-ww-kit-12', 'WW-KIT-12', 'Design 12', 'kids-youth-football-kits', 12),
  ('prod_kit_13', 'WIN WEARS Custom Team Uniform', 'custom-team-uniform-design-13-ww-kit-13', 'WW-KIT-13', 'Design 13', 'custom-team-uniforms', 13),
  ('prod_kit_14', 'WIN WEARS Custom Goalkeeper Kit', 'custom-goalkeeper-kit-design-14-ww-kit-14', 'WW-KIT-14', 'Design 14', 'goalkeeper-kits', 14),
  ('prod_kit_15', 'WIN WEARS Custom Club Football Kit', 'custom-club-football-kit-design-15-ww-kit-15', 'WW-KIT-15', 'Design 15', 'club-football-kits', 15),
  ('prod_kit_16', 'WIN WEARS Professional Match Kit', 'professional-match-kit-design-16-ww-kit-16', 'WW-KIT-16', 'Design 16', 'football-match-kits', 16),
  ('prod_kit_17', 'WIN WEARS Academy Soccer Uniform', 'academy-soccer-uniform-design-17-ww-kit-17', 'WW-KIT-17', 'Design 17', 'academy-football-kits', 17),
  ('prod_kit_18', 'WIN WEARS Training Football Kit', 'training-football-kit-design-18-ww-kit-18', 'WW-KIT-18', 'Design 18', 'football-training-kits', 18),
  ('prod_kit_19', 'WIN WEARS Youth Soccer Uniform', 'youth-soccer-uniform-design-19-ww-kit-19', 'WW-KIT-19', 'Design 19', 'kids-youth-football-kits', 19),
  ('prod_kit_20', 'WIN WEARS Custom Team Uniform', 'custom-team-uniform-design-20-ww-kit-20', 'WW-KIT-20', 'Design 20', 'custom-team-uniforms', 20),
  ('prod_kit_21', 'WIN WEARS Custom Club Football Kit', 'custom-club-football-kit-design-21-ww-kit-21', 'WW-KIT-21', 'Design 21', 'club-football-kits', 21),
  ('prod_kit_22', 'WIN WEARS Professional Match Kit', 'professional-match-kit-design-22-ww-kit-22', 'WW-KIT-22', 'Design 22', 'football-match-kits', 22),
  ('prod_kit_23', 'WIN WEARS Academy Soccer Uniform', 'academy-soccer-uniform-design-23-ww-kit-23', 'WW-KIT-23', 'Design 23', 'academy-football-kits', 23),
  ('prod_kit_24', 'WIN WEARS Training Football Kit', 'training-football-kit-design-24-ww-kit-24', 'WW-KIT-24', 'Design 24', 'football-training-kits', 24),
  ('prod_kit_25', 'WIN WEARS Youth Soccer Uniform', 'youth-soccer-uniform-design-25-ww-kit-25', 'WW-KIT-25', 'Design 25', 'kids-youth-football-kits', 25),
  ('prod_kit_26', 'WIN WEARS Custom Team Uniform', 'custom-team-uniform-design-26-ww-kit-26', 'WW-KIT-26', 'Design 26', 'custom-team-uniforms', 26),
  ('prod_kit_27', 'WIN WEARS Custom Club Football Kit', 'custom-club-football-kit-design-27-ww-kit-27', 'WW-KIT-27', 'Design 27', 'club-football-kits', 27),
  ('prod_kit_28', 'WIN WEARS Professional Match Kit', 'professional-match-kit-design-28-ww-kit-28', 'WW-KIT-28', 'Design 28', 'football-match-kits', 28),
  ('prod_kit_29', 'WIN WEARS Academy Soccer Uniform', 'academy-soccer-uniform-design-29-ww-kit-29', 'WW-KIT-29', 'Design 29', 'academy-football-kits', 29),
  ('prod_kit_30', 'WIN WEARS Training Football Kit', 'training-football-kit-design-30-ww-kit-30', 'WW-KIT-30', 'Design 30', 'football-training-kits', 30),
  ('prod_kit_31', 'WIN WEARS Youth Soccer Uniform', 'youth-soccer-uniform-design-31-ww-kit-31', 'WW-KIT-31', 'Design 31', 'kids-youth-football-kits', 31),
  ('prod_kit_32', 'WIN WEARS Custom Team Uniform', 'custom-team-uniform-design-32-ww-kit-32', 'WW-KIT-32', 'Design 32', 'custom-team-uniforms', 32),
  ('prod_kit_33', 'WIN WEARS Custom Club Football Kit', 'custom-club-football-kit-design-33-ww-kit-33', 'WW-KIT-33', 'Design 33', 'club-football-kits', 33),
  ('prod_kit_34', 'WIN WEARS Professional Match Kit', 'professional-match-kit-design-34-ww-kit-34', 'WW-KIT-34', 'Design 34', 'football-match-kits', 34),
  ('prod_kit_35', 'WIN WEARS Academy Soccer Uniform', 'academy-soccer-uniform-design-35-ww-kit-35', 'WW-KIT-35', 'Design 35', 'academy-football-kits', 35),
  ('prod_kit_36', 'WIN WEARS Training Football Kit', 'training-football-kit-design-36-ww-kit-36', 'WW-KIT-36', 'Design 36', 'football-training-kits', 36)
) AS v(id, name, slug, sku, design, category, ord)
JOIN "Category" c ON c."slug" = v.category
ON CONFLICT DO NOTHING;

INSERT INTO "ProductImage" ("id", "productId", "url", "altText", "type", "isPrimary", "displayOrder")
SELECT v.id, p."id", v.url, v.alt, v.kind::"ImageType", v.main, v.ord
FROM (VALUES
  ('img_kit_01_1', 'custom-club-football-kit-design-01-ww-kit-01', '/assets/img/uniforms/kits/design-01/1.png', 'WIN WEARS Custom Club Football Kit — Design 01', 'MAIN', true, 0),
  ('img_kit_01_2', 'custom-club-football-kit-design-01-ww-kit-01', '/assets/img/uniforms/kits/design-01/2.png', 'WIN WEARS Custom Club Football Kit — Design 01 — view 2', 'GALLERY', false, 1),
  ('img_kit_02_1', 'professional-match-kit-design-02-ww-kit-02', '/assets/img/uniforms/kits/design-02/1.jpg', 'WIN WEARS Professional Match Kit — Design 02', 'MAIN', true, 0),
  ('img_kit_02_2', 'professional-match-kit-design-02-ww-kit-02', '/assets/img/uniforms/kits/design-02/2.jpg', 'WIN WEARS Professional Match Kit — Design 02 — view 2', 'GALLERY', false, 1),
  ('img_kit_02_3', 'professional-match-kit-design-02-ww-kit-02', '/assets/img/uniforms/kits/design-02/3.jpg', 'WIN WEARS Professional Match Kit — Design 02 — view 3', 'GALLERY', false, 2),
  ('img_kit_02_4', 'professional-match-kit-design-02-ww-kit-02', '/assets/img/uniforms/kits/design-02/4.jpg', 'WIN WEARS Professional Match Kit — Design 02 — view 4', 'GALLERY', false, 3),
  ('img_kit_02_5', 'professional-match-kit-design-02-ww-kit-02', '/assets/img/uniforms/kits/design-02/5.jpg', 'WIN WEARS Professional Match Kit — Design 02 — view 5', 'GALLERY', false, 4),
  ('img_kit_03_1', 'academy-soccer-uniform-design-03-ww-kit-03', '/assets/img/uniforms/kits/design-03/1.jpg', 'WIN WEARS Academy Soccer Uniform — Design 03', 'MAIN', true, 0),
  ('img_kit_03_2', 'academy-soccer-uniform-design-03-ww-kit-03', '/assets/img/uniforms/kits/design-03/2.jpg', 'WIN WEARS Academy Soccer Uniform — Design 03 — view 2', 'GALLERY', false, 1),
  ('img_kit_03_3', 'academy-soccer-uniform-design-03-ww-kit-03', '/assets/img/uniforms/kits/design-03/3.jpg', 'WIN WEARS Academy Soccer Uniform — Design 03 — view 3', 'GALLERY', false, 2),
  ('img_kit_03_4', 'academy-soccer-uniform-design-03-ww-kit-03', '/assets/img/uniforms/kits/design-03/4.jpg', 'WIN WEARS Academy Soccer Uniform — Design 03 — view 4', 'GALLERY', false, 3),
  ('img_kit_03_5', 'academy-soccer-uniform-design-03-ww-kit-03', '/assets/img/uniforms/kits/design-03/5.jpg', 'WIN WEARS Academy Soccer Uniform — Design 03 — view 5', 'GALLERY', false, 4),
  ('img_kit_03_6', 'academy-soccer-uniform-design-03-ww-kit-03', '/assets/img/uniforms/kits/design-03/6.jpg', 'WIN WEARS Academy Soccer Uniform — Design 03 — view 6', 'GALLERY', false, 5),
  ('img_kit_03_7', 'academy-soccer-uniform-design-03-ww-kit-03', '/assets/img/uniforms/kits/design-03/7.jpg', 'WIN WEARS Academy Soccer Uniform — Design 03 — view 7', 'GALLERY', false, 6),
  ('img_kit_04_1', 'training-football-kit-design-04-ww-kit-04', '/assets/img/uniforms/kits/design-04/1.jpg', 'WIN WEARS Training Football Kit — Design 04', 'MAIN', true, 0),
  ('img_kit_04_2', 'training-football-kit-design-04-ww-kit-04', '/assets/img/uniforms/kits/design-04/2.jpg', 'WIN WEARS Training Football Kit — Design 04 — view 2', 'GALLERY', false, 1),
  ('img_kit_04_3', 'training-football-kit-design-04-ww-kit-04', '/assets/img/uniforms/kits/design-04/3.jpg', 'WIN WEARS Training Football Kit — Design 04 — view 3', 'GALLERY', false, 2),
  ('img_kit_04_4', 'training-football-kit-design-04-ww-kit-04', '/assets/img/uniforms/kits/design-04/4.jpg', 'WIN WEARS Training Football Kit — Design 04 — view 4', 'GALLERY', false, 3),
  ('img_kit_04_5', 'training-football-kit-design-04-ww-kit-04', '/assets/img/uniforms/kits/design-04/5.jpg', 'WIN WEARS Training Football Kit — Design 04 — view 5', 'GALLERY', false, 4),
  ('img_kit_05_1', 'custom-goalkeeper-kit-design-05-ww-kit-05', '/assets/img/uniforms/kits/design-05/1.jpg', 'WIN WEARS Custom Goalkeeper Kit — Design 05', 'MAIN', true, 0),
  ('img_kit_05_2', 'custom-goalkeeper-kit-design-05-ww-kit-05', '/assets/img/uniforms/kits/design-05/2.jpg', 'WIN WEARS Custom Goalkeeper Kit — Design 05 — view 2', 'GALLERY', false, 1),
  ('img_kit_06_1', 'youth-soccer-uniform-design-06-ww-kit-06', '/assets/img/uniforms/kits/design-06/1.jpg', 'WIN WEARS Youth Soccer Uniform — Design 06', 'MAIN', true, 0),
  ('img_kit_06_2', 'youth-soccer-uniform-design-06-ww-kit-06', '/assets/img/uniforms/kits/design-06/2.jpg', 'WIN WEARS Youth Soccer Uniform — Design 06 — view 2', 'GALLERY', false, 1),
  ('img_kit_07_1', 'custom-team-uniform-design-07-ww-kit-07', '/assets/img/uniforms/kits/design-07/1.jpg', 'WIN WEARS Custom Team Uniform — Design 07', 'MAIN', true, 0),
  ('img_kit_07_2', 'custom-team-uniform-design-07-ww-kit-07', '/assets/img/uniforms/kits/design-07/2.jpg', 'WIN WEARS Custom Team Uniform — Design 07 — view 2', 'GALLERY', false, 1),
  ('img_kit_08_1', 'custom-club-football-kit-design-08-ww-kit-08', '/assets/img/uniforms/kits/design-08/1.jpg', 'WIN WEARS Custom Club Football Kit — Design 08', 'MAIN', true, 0),
  ('img_kit_08_2', 'custom-club-football-kit-design-08-ww-kit-08', '/assets/img/uniforms/kits/design-08/2.jpg', 'WIN WEARS Custom Club Football Kit — Design 08 — view 2', 'GALLERY', false, 1),
  ('img_kit_09_1', 'professional-match-kit-design-09-ww-kit-09', '/assets/img/uniforms/kits/design-09/1.jpg', 'WIN WEARS Professional Match Kit — Design 09', 'MAIN', true, 0),
  ('img_kit_09_2', 'professional-match-kit-design-09-ww-kit-09', '/assets/img/uniforms/kits/design-09/2.jpg', 'WIN WEARS Professional Match Kit — Design 09 — view 2', 'GALLERY', false, 1),
  ('img_kit_10_1', 'academy-soccer-uniform-design-10-ww-kit-10', '/assets/img/uniforms/kits/design-10/1.jpg', 'WIN WEARS Academy Soccer Uniform — Design 10', 'MAIN', true, 0),
  ('img_kit_10_2', 'academy-soccer-uniform-design-10-ww-kit-10', '/assets/img/uniforms/kits/design-10/2.jpg', 'WIN WEARS Academy Soccer Uniform — Design 10 — view 2', 'GALLERY', false, 1),
  ('img_kit_11_1', 'training-football-kit-design-11-ww-kit-11', '/assets/img/uniforms/kits/design-11/1.jpg', 'WIN WEARS Training Football Kit — Design 11', 'MAIN', true, 0),
  ('img_kit_11_2', 'training-football-kit-design-11-ww-kit-11', '/assets/img/uniforms/kits/design-11/2.jpg', 'WIN WEARS Training Football Kit — Design 11 — view 2', 'GALLERY', false, 1),
  ('img_kit_12_1', 'youth-soccer-uniform-design-12-ww-kit-12', '/assets/img/uniforms/kits/design-12/1.jpg', 'WIN WEARS Youth Soccer Uniform — Design 12', 'MAIN', true, 0),
  ('img_kit_12_2', 'youth-soccer-uniform-design-12-ww-kit-12', '/assets/img/uniforms/kits/design-12/2.jpg', 'WIN WEARS Youth Soccer Uniform — Design 12 — view 2', 'GALLERY', false, 1),
  ('img_kit_12_3', 'youth-soccer-uniform-design-12-ww-kit-12', '/assets/img/uniforms/kits/design-12/3.jpg', 'WIN WEARS Youth Soccer Uniform — Design 12 — view 3', 'GALLERY', false, 2),
  ('img_kit_12_4', 'youth-soccer-uniform-design-12-ww-kit-12', '/assets/img/uniforms/kits/design-12/4.jpg', 'WIN WEARS Youth Soccer Uniform — Design 12 — view 4', 'GALLERY', false, 3),
  ('img_kit_12_5', 'youth-soccer-uniform-design-12-ww-kit-12', '/assets/img/uniforms/kits/design-12/5.jpg', 'WIN WEARS Youth Soccer Uniform — Design 12 — view 5', 'GALLERY', false, 4),
  ('img_kit_12_6', 'youth-soccer-uniform-design-12-ww-kit-12', '/assets/img/uniforms/kits/design-12/6.jpg', 'WIN WEARS Youth Soccer Uniform — Design 12 — view 6', 'GALLERY', false, 5),
  ('img_kit_12_7', 'youth-soccer-uniform-design-12-ww-kit-12', '/assets/img/uniforms/kits/design-12/7.jpg', 'WIN WEARS Youth Soccer Uniform — Design 12 — view 7', 'GALLERY', false, 6),
  ('img_kit_13_1', 'custom-team-uniform-design-13-ww-kit-13', '/assets/img/uniforms/kits/design-13/1.jpg', 'WIN WEARS Custom Team Uniform — Design 13', 'MAIN', true, 0),
  ('img_kit_13_2', 'custom-team-uniform-design-13-ww-kit-13', '/assets/img/uniforms/kits/design-13/2.jpg', 'WIN WEARS Custom Team Uniform — Design 13 — view 2', 'GALLERY', false, 1),
  ('img_kit_14_1', 'custom-goalkeeper-kit-design-14-ww-kit-14', '/assets/img/uniforms/kits/design-14/1.jpg', 'WIN WEARS Custom Goalkeeper Kit — Design 14', 'MAIN', true, 0),
  ('img_kit_14_2', 'custom-goalkeeper-kit-design-14-ww-kit-14', '/assets/img/uniforms/kits/design-14/2.jpg', 'WIN WEARS Custom Goalkeeper Kit — Design 14 — view 2', 'GALLERY', false, 1),
  ('img_kit_14_3', 'custom-goalkeeper-kit-design-14-ww-kit-14', '/assets/img/uniforms/kits/design-14/3.jpg', 'WIN WEARS Custom Goalkeeper Kit — Design 14 — view 3', 'GALLERY', false, 2),
  ('img_kit_14_4', 'custom-goalkeeper-kit-design-14-ww-kit-14', '/assets/img/uniforms/kits/design-14/4.jpg', 'WIN WEARS Custom Goalkeeper Kit — Design 14 — view 4', 'GALLERY', false, 3),
  ('img_kit_15_1', 'custom-club-football-kit-design-15-ww-kit-15', '/assets/img/uniforms/kits/design-15/1.jpg', 'WIN WEARS Custom Club Football Kit — Design 15', 'MAIN', true, 0),
  ('img_kit_15_2', 'custom-club-football-kit-design-15-ww-kit-15', '/assets/img/uniforms/kits/design-15/2.jpg', 'WIN WEARS Custom Club Football Kit — Design 15 — view 2', 'GALLERY', false, 1),
  ('img_kit_16_1', 'professional-match-kit-design-16-ww-kit-16', '/assets/img/uniforms/kits/design-16/1.jpg', 'WIN WEARS Professional Match Kit — Design 16', 'MAIN', true, 0),
  ('img_kit_16_2', 'professional-match-kit-design-16-ww-kit-16', '/assets/img/uniforms/kits/design-16/2.jpg', 'WIN WEARS Professional Match Kit — Design 16 — view 2', 'GALLERY', false, 1),
  ('img_kit_17_1', 'academy-soccer-uniform-design-17-ww-kit-17', '/assets/img/uniforms/kits/design-17/1.jpg', 'WIN WEARS Academy Soccer Uniform — Design 17', 'MAIN', true, 0),
  ('img_kit_17_2', 'academy-soccer-uniform-design-17-ww-kit-17', '/assets/img/uniforms/kits/design-17/2.jpg', 'WIN WEARS Academy Soccer Uniform — Design 17 — view 2', 'GALLERY', false, 1),
  ('img_kit_18_1', 'training-football-kit-design-18-ww-kit-18', '/assets/img/uniforms/kits/design-18/1.jpg', 'WIN WEARS Training Football Kit — Design 18', 'MAIN', true, 0),
  ('img_kit_18_2', 'training-football-kit-design-18-ww-kit-18', '/assets/img/uniforms/kits/design-18/2.jpg', 'WIN WEARS Training Football Kit — Design 18 — view 2', 'GALLERY', false, 1),
  ('img_kit_19_1', 'youth-soccer-uniform-design-19-ww-kit-19', '/assets/img/uniforms/kits/design-19/1.jpg', 'WIN WEARS Youth Soccer Uniform — Design 19', 'MAIN', true, 0),
  ('img_kit_19_2', 'youth-soccer-uniform-design-19-ww-kit-19', '/assets/img/uniforms/kits/design-19/2.jpg', 'WIN WEARS Youth Soccer Uniform — Design 19 — view 2', 'GALLERY', false, 1),
  ('img_kit_20_1', 'custom-team-uniform-design-20-ww-kit-20', '/assets/img/uniforms/kits/design-20/1.jpg', 'WIN WEARS Custom Team Uniform — Design 20', 'MAIN', true, 0),
  ('img_kit_20_2', 'custom-team-uniform-design-20-ww-kit-20', '/assets/img/uniforms/kits/design-20/2.jpg', 'WIN WEARS Custom Team Uniform — Design 20 — view 2', 'GALLERY', false, 1),
  ('img_kit_21_1', 'custom-club-football-kit-design-21-ww-kit-21', '/assets/img/uniforms/kits/design-21/1.jpg', 'WIN WEARS Custom Club Football Kit — Design 21', 'MAIN', true, 0),
  ('img_kit_21_2', 'custom-club-football-kit-design-21-ww-kit-21', '/assets/img/uniforms/kits/design-21/2.jpg', 'WIN WEARS Custom Club Football Kit — Design 21 — view 2', 'GALLERY', false, 1),
  ('img_kit_22_1', 'professional-match-kit-design-22-ww-kit-22', '/assets/img/uniforms/kits/design-22/1.jpg', 'WIN WEARS Professional Match Kit — Design 22', 'MAIN', true, 0),
  ('img_kit_22_2', 'professional-match-kit-design-22-ww-kit-22', '/assets/img/uniforms/kits/design-22/2.jpg', 'WIN WEARS Professional Match Kit — Design 22 — view 2', 'GALLERY', false, 1),
  ('img_kit_23_1', 'academy-soccer-uniform-design-23-ww-kit-23', '/assets/img/uniforms/kits/design-23/1.jpg', 'WIN WEARS Academy Soccer Uniform — Design 23', 'MAIN', true, 0),
  ('img_kit_23_2', 'academy-soccer-uniform-design-23-ww-kit-23', '/assets/img/uniforms/kits/design-23/2.jpg', 'WIN WEARS Academy Soccer Uniform — Design 23 — view 2', 'GALLERY', false, 1),
  ('img_kit_24_1', 'training-football-kit-design-24-ww-kit-24', '/assets/img/uniforms/kits/design-24/1.jpg', 'WIN WEARS Training Football Kit — Design 24', 'MAIN', true, 0),
  ('img_kit_24_2', 'training-football-kit-design-24-ww-kit-24', '/assets/img/uniforms/kits/design-24/2.jpg', 'WIN WEARS Training Football Kit — Design 24 — view 2', 'GALLERY', false, 1),
  ('img_kit_25_1', 'youth-soccer-uniform-design-25-ww-kit-25', '/assets/img/uniforms/kits/design-25/1.jpg', 'WIN WEARS Youth Soccer Uniform — Design 25', 'MAIN', true, 0),
  ('img_kit_25_2', 'youth-soccer-uniform-design-25-ww-kit-25', '/assets/img/uniforms/kits/design-25/2.jpg', 'WIN WEARS Youth Soccer Uniform — Design 25 — view 2', 'GALLERY', false, 1),
  ('img_kit_26_1', 'custom-team-uniform-design-26-ww-kit-26', '/assets/img/uniforms/kits/design-26/1.jpg', 'WIN WEARS Custom Team Uniform — Design 26', 'MAIN', true, 0),
  ('img_kit_26_2', 'custom-team-uniform-design-26-ww-kit-26', '/assets/img/uniforms/kits/design-26/2.jpg', 'WIN WEARS Custom Team Uniform — Design 26 — view 2', 'GALLERY', false, 1),
  ('img_kit_27_1', 'custom-club-football-kit-design-27-ww-kit-27', '/assets/img/uniforms/kits/design-27/1.jpg', 'WIN WEARS Custom Club Football Kit — Design 27', 'MAIN', true, 0),
  ('img_kit_27_2', 'custom-club-football-kit-design-27-ww-kit-27', '/assets/img/uniforms/kits/design-27/2.jpg', 'WIN WEARS Custom Club Football Kit — Design 27 — view 2', 'GALLERY', false, 1),
  ('img_kit_28_1', 'professional-match-kit-design-28-ww-kit-28', '/assets/img/uniforms/kits/design-28/1.jpg', 'WIN WEARS Professional Match Kit — Design 28', 'MAIN', true, 0),
  ('img_kit_28_2', 'professional-match-kit-design-28-ww-kit-28', '/assets/img/uniforms/kits/design-28/2.jpg', 'WIN WEARS Professional Match Kit — Design 28 — view 2', 'GALLERY', false, 1),
  ('img_kit_29_1', 'academy-soccer-uniform-design-29-ww-kit-29', '/assets/img/uniforms/kits/design-29/1.jpg', 'WIN WEARS Academy Soccer Uniform — Design 29', 'MAIN', true, 0),
  ('img_kit_29_2', 'academy-soccer-uniform-design-29-ww-kit-29', '/assets/img/uniforms/kits/design-29/2.jpg', 'WIN WEARS Academy Soccer Uniform — Design 29 — view 2', 'GALLERY', false, 1),
  ('img_kit_30_1', 'training-football-kit-design-30-ww-kit-30', '/assets/img/uniforms/kits/design-30/1.jpg', 'WIN WEARS Training Football Kit — Design 30', 'MAIN', true, 0),
  ('img_kit_30_2', 'training-football-kit-design-30-ww-kit-30', '/assets/img/uniforms/kits/design-30/2.jpg', 'WIN WEARS Training Football Kit — Design 30 — view 2', 'GALLERY', false, 1),
  ('img_kit_31_1', 'youth-soccer-uniform-design-31-ww-kit-31', '/assets/img/uniforms/kits/design-31/1.jpg', 'WIN WEARS Youth Soccer Uniform — Design 31', 'MAIN', true, 0),
  ('img_kit_31_2', 'youth-soccer-uniform-design-31-ww-kit-31', '/assets/img/uniforms/kits/design-31/2.jpg', 'WIN WEARS Youth Soccer Uniform — Design 31 — view 2', 'GALLERY', false, 1),
  ('img_kit_32_1', 'custom-team-uniform-design-32-ww-kit-32', '/assets/img/uniforms/kits/design-32/1.jpg', 'WIN WEARS Custom Team Uniform — Design 32', 'MAIN', true, 0),
  ('img_kit_32_2', 'custom-team-uniform-design-32-ww-kit-32', '/assets/img/uniforms/kits/design-32/2.jpg', 'WIN WEARS Custom Team Uniform — Design 32 — view 2', 'GALLERY', false, 1),
  ('img_kit_33_1', 'custom-club-football-kit-design-33-ww-kit-33', '/assets/img/uniforms/kits/design-33/1.jpg', 'WIN WEARS Custom Club Football Kit — Design 33', 'MAIN', true, 0),
  ('img_kit_33_2', 'custom-club-football-kit-design-33-ww-kit-33', '/assets/img/uniforms/kits/design-33/2.jpg', 'WIN WEARS Custom Club Football Kit — Design 33 — view 2', 'GALLERY', false, 1),
  ('img_kit_34_1', 'professional-match-kit-design-34-ww-kit-34', '/assets/img/uniforms/kits/design-34/1.jpg', 'WIN WEARS Professional Match Kit — Design 34', 'MAIN', true, 0),
  ('img_kit_34_2', 'professional-match-kit-design-34-ww-kit-34', '/assets/img/uniforms/kits/design-34/2.jpg', 'WIN WEARS Professional Match Kit — Design 34 — view 2', 'GALLERY', false, 1),
  ('img_kit_35_1', 'academy-soccer-uniform-design-35-ww-kit-35', '/assets/img/uniforms/kits/design-35/1.jpg', 'WIN WEARS Academy Soccer Uniform — Design 35', 'MAIN', true, 0),
  ('img_kit_35_2', 'academy-soccer-uniform-design-35-ww-kit-35', '/assets/img/uniforms/kits/design-35/2.jpg', 'WIN WEARS Academy Soccer Uniform — Design 35 — view 2', 'GALLERY', false, 1),
  ('img_kit_36_1', 'training-football-kit-design-36-ww-kit-36', '/assets/img/uniforms/kits/design-36/1.jpg', 'WIN WEARS Training Football Kit — Design 36', 'MAIN', true, 0),
  ('img_kit_36_2', 'training-football-kit-design-36-ww-kit-36', '/assets/img/uniforms/kits/design-36/2.jpg', 'WIN WEARS Training Football Kit — Design 36 — view 2', 'GALLERY', false, 1)
) AS v(id, slug, url, alt, kind, main, ord)
JOIN "Product" p ON p."slug" = v.slug
WHERE NOT EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p."id" AND i."url" = v.url)
ON CONFLICT DO NOTHING;

UPDATE "Category" SET "image" = '/assets/img/uniforms/kits/design-01/1.png', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'club-football-kits' AND "image" IS NULL;
UPDATE "Category" SET "image" = '/assets/img/uniforms/kits/design-02/1.jpg', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'football-match-kits' AND "image" IS NULL;
UPDATE "Category" SET "image" = '/assets/img/uniforms/kits/design-03/1.jpg', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'academy-football-kits' AND "image" IS NULL;
UPDATE "Category" SET "image" = '/assets/img/uniforms/kits/design-04/1.jpg', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'football-training-kits' AND "image" IS NULL;
UPDATE "Category" SET "image" = '/assets/img/uniforms/kits/design-05/1.jpg', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'goalkeeper-kits' AND "image" IS NULL;
UPDATE "Category" SET "image" = '/assets/img/uniforms/kits/design-06/1.jpg', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'kids-youth-football-kits' AND "image" IS NULL;
UPDATE "Category" SET "image" = '/assets/img/uniforms/kits/design-07/1.jpg', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'custom-team-uniforms' AND "image" IS NULL;
UPDATE "Category" SET "image" = '/assets/img/uniforms/kits/design-20/1.jpg', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'custom-soccer-jerseys' AND "image" IS NULL;
UPDATE "Category" SET "image" = '/assets/img/uniforms/kits/design-17/1.jpg', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'football-shorts' AND "image" IS NULL;
