-- Football Socks: five sock styles from the WIN WEARS photographs.
--
-- Quote only, no price, no invented specification; named from what each set
-- of photographs shows. ON CONFLICT DO NOTHING skips anything whose slug or
-- SKU already exists, so this cannot overwrite an admin edit or fail a deploy.

INSERT INTO "Product" ("id", "productName", "slug", "sku", "shortDescription", "categoryId", "status", "featured", "displayOrder", "customizationAvailable", "quoteOnly", "publishedAt", "updatedAt")
SELECT v.id, v.name, v.slug, v.sku, v.colour, c."id", 'PUBLISHED'::"ProductStatus", false, v.ord, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('prod_sock_01', 'WIN WEARS Custom Grip Socks', 'custom-grip-socks-ww-sock-01', 'WW-SOCK-01', 'Yellow', 1),
  ('prod_sock_02', 'WIN WEARS Custom Crew Grip Socks', 'custom-crew-grip-socks-ww-sock-02', 'WW-SOCK-02', 'Black · Red · Sky Blue · White · Orange', 2),
  ('prod_sock_03', 'WIN WEARS Custom Training Grip Socks', 'custom-training-grip-socks-ww-sock-03', 'WW-SOCK-03', 'White · Assorted Colours', 3),
  ('prod_sock_04', 'WIN WEARS Custom Mid-Calf Grip Socks', 'custom-mid-calf-grip-socks-ww-sock-04', 'WW-SOCK-04', 'Red · Orange · Yellow · Black', 4),
  ('prod_sock_05', 'WIN WEARS Custom Long Match Socks', 'custom-long-match-socks-ww-sock-05', 'WW-SOCK-05', 'Black · White · Red · Sky Blue', 5)
) AS v(id, name, slug, sku, colour, ord)
JOIN "Category" c ON c."slug" = 'football-socks'
ON CONFLICT DO NOTHING;

INSERT INTO "ProductImage" ("id", "productId", "url", "altText", "type", "isPrimary", "displayOrder")
SELECT v.id, p."id", v.url, v.alt, v.kind::"ImageType", v.main, v.ord
FROM (VALUES
  ('img_sock_01_1', 'custom-grip-socks-ww-sock-01', '/assets/img/uniforms/socks/sock-01/1.jpg', 'WIN WEARS Custom Grip Socks — Yellow', 'MAIN', true, 0),
  ('img_sock_01_2', 'custom-grip-socks-ww-sock-01', '/assets/img/uniforms/socks/sock-01/2.jpg', 'WIN WEARS Custom Grip Socks — Yellow — view 2', 'GALLERY', false, 1),
  ('img_sock_01_3', 'custom-grip-socks-ww-sock-01', '/assets/img/uniforms/socks/sock-01/3.jpg', 'WIN WEARS Custom Grip Socks — Yellow — view 3', 'GALLERY', false, 2),
  ('img_sock_01_4', 'custom-grip-socks-ww-sock-01', '/assets/img/uniforms/socks/sock-01/4.jpg', 'WIN WEARS Custom Grip Socks — Yellow — view 4', 'GALLERY', false, 3),
  ('img_sock_01_5', 'custom-grip-socks-ww-sock-01', '/assets/img/uniforms/socks/sock-01/5.jpg', 'WIN WEARS Custom Grip Socks — Yellow — view 5', 'GALLERY', false, 4),
  ('img_sock_02_1', 'custom-crew-grip-socks-ww-sock-02', '/assets/img/uniforms/socks/sock-02/1.jpg', 'WIN WEARS Custom Crew Grip Socks — Black · Red · Sky Blue · White · Orange', 'MAIN', true, 0),
  ('img_sock_02_2', 'custom-crew-grip-socks-ww-sock-02', '/assets/img/uniforms/socks/sock-02/2.jpg', 'WIN WEARS Custom Crew Grip Socks — Black · Red · Sky Blue · White · Orange — view 2', 'GALLERY', false, 1),
  ('img_sock_02_3', 'custom-crew-grip-socks-ww-sock-02', '/assets/img/uniforms/socks/sock-02/3.jpg', 'WIN WEARS Custom Crew Grip Socks — Black · Red · Sky Blue · White · Orange — view 3', 'GALLERY', false, 2),
  ('img_sock_02_4', 'custom-crew-grip-socks-ww-sock-02', '/assets/img/uniforms/socks/sock-02/4.jpg', 'WIN WEARS Custom Crew Grip Socks — Black · Red · Sky Blue · White · Orange — view 4', 'GALLERY', false, 3),
  ('img_sock_02_5', 'custom-crew-grip-socks-ww-sock-02', '/assets/img/uniforms/socks/sock-02/5.jpg', 'WIN WEARS Custom Crew Grip Socks — Black · Red · Sky Blue · White · Orange — view 5', 'GALLERY', false, 4),
  ('img_sock_03_1', 'custom-training-grip-socks-ww-sock-03', '/assets/img/uniforms/socks/sock-03/1.jpg', 'WIN WEARS Custom Training Grip Socks — White · Assorted Colours', 'MAIN', true, 0),
  ('img_sock_03_2', 'custom-training-grip-socks-ww-sock-03', '/assets/img/uniforms/socks/sock-03/2.jpg', 'WIN WEARS Custom Training Grip Socks — White · Assorted Colours — view 2', 'GALLERY', false, 1),
  ('img_sock_03_3', 'custom-training-grip-socks-ww-sock-03', '/assets/img/uniforms/socks/sock-03/3.jpg', 'WIN WEARS Custom Training Grip Socks — White · Assorted Colours — view 3', 'GALLERY', false, 2),
  ('img_sock_03_4', 'custom-training-grip-socks-ww-sock-03', '/assets/img/uniforms/socks/sock-03/4.jpg', 'WIN WEARS Custom Training Grip Socks — White · Assorted Colours — view 4', 'GALLERY', false, 3),
  ('img_sock_03_5', 'custom-training-grip-socks-ww-sock-03', '/assets/img/uniforms/socks/sock-03/5.jpg', 'WIN WEARS Custom Training Grip Socks — White · Assorted Colours — view 5', 'GALLERY', false, 4),
  ('img_sock_03_6', 'custom-training-grip-socks-ww-sock-03', '/assets/img/uniforms/socks/sock-03/6.jpg', 'WIN WEARS Custom Training Grip Socks — White · Assorted Colours — view 6', 'GALLERY', false, 5),
  ('img_sock_04_1', 'custom-mid-calf-grip-socks-ww-sock-04', '/assets/img/uniforms/socks/sock-04/1.jpg', 'WIN WEARS Custom Mid-Calf Grip Socks — Red · Orange · Yellow · Black', 'MAIN', true, 0),
  ('img_sock_04_2', 'custom-mid-calf-grip-socks-ww-sock-04', '/assets/img/uniforms/socks/sock-04/2.jpg', 'WIN WEARS Custom Mid-Calf Grip Socks — Red · Orange · Yellow · Black — view 2', 'GALLERY', false, 1),
  ('img_sock_04_3', 'custom-mid-calf-grip-socks-ww-sock-04', '/assets/img/uniforms/socks/sock-04/3.jpg', 'WIN WEARS Custom Mid-Calf Grip Socks — Red · Orange · Yellow · Black — view 3', 'GALLERY', false, 2),
  ('img_sock_04_4', 'custom-mid-calf-grip-socks-ww-sock-04', '/assets/img/uniforms/socks/sock-04/4.jpg', 'WIN WEARS Custom Mid-Calf Grip Socks — Red · Orange · Yellow · Black — view 4', 'GALLERY', false, 3),
  ('img_sock_05_1', 'custom-long-match-socks-ww-sock-05', '/assets/img/uniforms/socks/sock-05/1.jpg', 'WIN WEARS Custom Long Match Socks — Black · White · Red · Sky Blue', 'MAIN', true, 0),
  ('img_sock_05_2', 'custom-long-match-socks-ww-sock-05', '/assets/img/uniforms/socks/sock-05/2.jpg', 'WIN WEARS Custom Long Match Socks — Black · White · Red · Sky Blue — view 2', 'GALLERY', false, 1),
  ('img_sock_05_3', 'custom-long-match-socks-ww-sock-05', '/assets/img/uniforms/socks/sock-05/3.jpg', 'WIN WEARS Custom Long Match Socks — Black · White · Red · Sky Blue — view 3', 'GALLERY', false, 2),
  ('img_sock_05_4', 'custom-long-match-socks-ww-sock-05', '/assets/img/uniforms/socks/sock-05/4.jpg', 'WIN WEARS Custom Long Match Socks — Black · White · Red · Sky Blue — view 4', 'GALLERY', false, 3),
  ('img_sock_05_5', 'custom-long-match-socks-ww-sock-05', '/assets/img/uniforms/socks/sock-05/5.jpg', 'WIN WEARS Custom Long Match Socks — Black · White · Red · Sky Blue — view 5', 'GALLERY', false, 4),
  ('img_sock_05_6', 'custom-long-match-socks-ww-sock-05', '/assets/img/uniforms/socks/sock-05/6.jpg', 'WIN WEARS Custom Long Match Socks — Black · White · Red · Sky Blue — view 6', 'GALLERY', false, 5)
) AS v(id, slug, url, alt, kind, main, ord)
JOIN "Product" p ON p."slug" = v.slug
WHERE NOT EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p."id" AND i."url" = v.url)
ON CONFLICT DO NOTHING;

UPDATE "Category" SET "image" = '/assets/img/uniforms/socks/sock-02/1.jpg', "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'football-socks' AND "image" IS NULL;
