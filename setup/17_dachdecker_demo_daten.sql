-- ============================================================
-- StockMaster — Demo-Daten für Präsentation bei einem Dachdecker-
-- Betrieb: 100 Artikel (Dacheindeckung, Abdichtung, Dämmung,
-- Klempnerarbeiten, Entwässerung, Befestigung, PV-Montage,
-- Werkzeuge, Arbeitsschutz, Gerüstbau) + 5 realistische Projekte
-- mit Materialplanung, laufender Zeiterfassung und bereits
-- gebuchtem Warenausgang, damit Dashboard/Aufträge sofort "gefüllt"
-- wirken. Numbering ART-2001–ART-2100, kollidiert nicht mit den
-- ART-10xx Testartikeln aus 02_seed.sql.
-- Safe to run multiple times (upserts / distinct numbers).
-- Run after 16_bestellung_projekt.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ── Lieferanten (falls noch nicht vorhanden) ──
insert into public.lieferanten (name) values
  ('Nelskamp Dachziegel'), ('Braas GmbH'), ('Bramac Dachsysteme'), ('Klöber GmbH'),
  ('Isover Saint-Gobain'), ('Icopal/BMI Deutschland'), ('Rockwool Deutschland'),
  ('Holzland Nord'), ('Rheinzink GmbH'), ('Prefa Aluminiumprodukte'),
  ('Ejot Baubefestigungen'), ('Rothoblaas'), ('Velux Deutschland'), ('Layher Gerüstbau'),
  ('Würth GmbH'), ('Bosch Professional'), ('Uvex Safety')
on conflict (name) do nothing;

-- ── Artikel ──
insert into public.artikel (nummer, name, kategorie, menge, einheit, mindestbestand, lagerort, preis, lieferant, lieferant_id, bild) values
-- Dachziegel
('ART-2001','Tondachziegel Frankfurter Pfanne rot','Dachziegel',3200,'Stk',800,'Außenlager D1-01',1.15,'Nelskamp Dachziegel',(select id from public.lieferanten where name='Nelskamp Dachziegel'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2002','Tondachziegel Biberschwanz naturrot','Dachziegel',5400,'Stk',1200,'Außenlager D1-02',0.95,'Braas GmbH',(select id from public.lieferanten where name='Braas GmbH'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2003','Betondachstein Doppelmuldenfalz anthrazit','Dachziegel',2800,'Stk',600,'Außenlager D1-03',1.35,'Braas GmbH',(select id from public.lieferanten where name='Braas GmbH'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2004','Flachdachziegel Rubin 13V','Dachziegel',1900,'Stk',500,'Außenlager D1-04',1.65,'Bramac Dachsysteme',(select id from public.lieferanten where name='Bramac Dachsysteme'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2005','Firstziegel rund rot','Dachziegel',340,'Stk',100,'Außenlager D1-05',3.20,'Nelskamp Dachziegel',(select id from public.lieferanten where name='Nelskamp Dachziegel'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2006','Ortgangziegel links','Dachziegel',180,'Stk',60,'Außenlager D1-06',3.80,'Braas GmbH',(select id from public.lieferanten where name='Braas GmbH'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2007','Ortgangziegel rechts','Dachziegel',175,'Stk',60,'Außenlager D1-07',3.80,'Braas GmbH',(select id from public.lieferanten where name='Braas GmbH'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2008','Pultziegel anthrazit','Dachziegel',620,'Stk',150,'Außenlager D1-08',1.45,'Bramac Dachsysteme',(select id from public.lieferanten where name='Bramac Dachsysteme'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
-- Dachbahnen
('ART-2009','Unterspannbahn diffusionsoffen 1,5x50m','Dachbahnen',42,'Rolle',10,'Regal B1-01',89.00,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1620283085439-39620a1e21c5?w=400'),
('ART-2010','Dampfsperrbahn PE 2,0x25m','Dachbahnen',28,'Rolle',8,'Regal B1-02',54.00,'Isover Saint-Gobain',(select id from public.lieferanten where name='Isover Saint-Gobain'),'https://images.unsplash.com/photo-1620283085439-39620a1e21c5?w=400'),
('ART-2011','Bitumen-Schweißbahn V13 1x10m','Dachbahnen',65,'Rolle',15,'Regal B1-03',42.50,'Icopal/BMI Deutschland',(select id from public.lieferanten where name='Icopal/BMI Deutschland'),'https://images.unsplash.com/photo-1620283085439-39620a1e21c5?w=400'),
('ART-2012','Bitumen-Voranstrich 5L','Dachbahnen',34,'Stk',10,'Regal B1-04',18.90,'Icopal/BMI Deutschland',(select id from public.lieferanten where name='Icopal/BMI Deutschland'),'https://images.unsplash.com/photo-1620283085439-39620a1e21c5?w=400'),
('ART-2013','Trennlage Vlies 1x20m','Dachbahnen',22,'Rolle',6,'Regal B1-05',31.00,'Icopal/BMI Deutschland',(select id from public.lieferanten where name='Icopal/BMI Deutschland'),'https://images.unsplash.com/photo-1620283085439-39620a1e21c5?w=400'),
('ART-2014','Nageldichtband selbstklebend 10m','Dachbahnen',58,'Rolle',15,'Regal B1-06',12.40,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1620283085439-39620a1e21c5?w=400'),
('ART-2015','Traufrandstreifen 10m','Dachbahnen',40,'Rolle',10,'Regal B1-07',9.80,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1620283085439-39620a1e21c5?w=400'),
-- Dämmstoffe
('ART-2016','Aufsparrendämmung PIR 120mm','Dämmstoffe',180,'m²',40,'Regal B2-01',28.50,'Isover Saint-Gobain',(select id from public.lieferanten where name='Isover Saint-Gobain'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2017','Zwischensparrendämmung Steinwolle 160mm','Dämmstoffe',240,'m²',60,'Regal B2-02',14.20,'Rockwool Deutschland',(select id from public.lieferanten where name='Rockwool Deutschland'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2018','Klemmfilz Glaswolle 200mm','Dämmstoffe',310,'m²',80,'Regal B2-03',11.90,'Isover Saint-Gobain',(select id from public.lieferanten where name='Isover Saint-Gobain'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2019','Dampfbremsfolie intelligent 1,5x50m','Dämmstoffe',18,'Rolle',5,'Regal B2-04',175.00,'Isover Saint-Gobain',(select id from public.lieferanten where name='Isover Saint-Gobain'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2020','Trittschalldämmung Flachdach 40mm','Dämmstoffe',95,'m²',20,'Regal B2-05',19.60,'Rockwool Deutschland',(select id from public.lieferanten where name='Rockwool Deutschland'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2021','Klebeband Dampfbremse 40m','Dämmstoffe',46,'Rolle',12,'Regal B2-06',16.50,'Isover Saint-Gobain',(select id from public.lieferanten where name='Isover Saint-Gobain'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
-- Bauholz
('ART-2022','Dachlatte 30x50mm KVH','Bauholz',1450,'m',300,'Außenlager D2-01',1.20,'Holzland Nord',(select id from public.lieferanten where name='Holzland Nord'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2023','Konterlatte 24x48mm','Bauholz',980,'m',250,'Außenlager D2-02',1.05,'Holzland Nord',(select id from public.lieferanten where name='Holzland Nord'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2024','Sparren 80x180mm C24','Bauholz',420,'m',100,'Außenlager D2-03',6.80,'Holzland Nord',(select id from public.lieferanten where name='Holzland Nord'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2025','Kantholz 60x80mm','Bauholz',560,'m',150,'Außenlager D2-04',3.40,'Holzland Nord',(select id from public.lieferanten where name='Holzland Nord'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2026','OSB-Platte 22mm 2500x1250','Bauholz',140,'Stk',30,'Außenlager D2-05',34.50,'Holzland Nord',(select id from public.lieferanten where name='Holzland Nord'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-2027','Schalbrett 24mm gehobelt','Bauholz',320,'m²',80,'Außenlager D2-06',8.90,'Holzland Nord',(select id from public.lieferanten where name='Holzland Nord'),'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
-- Klempnerblech
('ART-2028','Titanzink-Blech 0,7mm','Klempnerblech',85,'m²',20,'Regal C1-01',42.00,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
('ART-2029','Alu-Blech farbbeschichtet anthrazit 0,7mm','Klempnerblech',120,'m²',25,'Regal C1-02',38.50,'Prefa Aluminiumprodukte',(select id from public.lieferanten where name='Prefa Aluminiumprodukte'),'https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
('ART-2030','Kaminanschluss-Set universal','Klempnerblech',22,'Stk',5,'Regal C1-03',145.00,'Braas GmbH',(select id from public.lieferanten where name='Braas GmbH'),'https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
('ART-2031','Traufblech Alu 2m','Klempnerblech',210,'Stk',40,'Regal C1-04',14.90,'Prefa Aluminiumprodukte',(select id from public.lieferanten where name='Prefa Aluminiumprodukte'),'https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
('ART-2032','Ortgangblech Alu 2m','Klempnerblech',195,'Stk',40,'Regal C1-05',16.20,'Prefa Aluminiumprodukte',(select id from public.lieferanten where name='Prefa Aluminiumprodukte'),'https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
('ART-2033','Kehlblech verzinkt 2m','Klempnerblech',88,'Stk',20,'Regal C1-06',22.50,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
('ART-2034','Wandanschlussblech Alu 2m','Klempnerblech',130,'Stk',30,'Regal C1-07',13.40,'Prefa Aluminiumprodukte',(select id from public.lieferanten where name='Prefa Aluminiumprodukte'),'https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
('ART-2035','Schneefangblech verzinkt 2m','Klempnerblech',60,'Stk',15,'Regal C1-08',19.80,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
-- Dachentwässerung
('ART-2036','Dachrinne halbrund 333mm Zink','Dachentwässerung',240,'m',50,'Regal C2-01',18.60,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1607400201515-c2c41c07d307?w=400'),
('ART-2037','Fallrohr rund 100mm Zink','Dachentwässerung',180,'m',40,'Regal C2-02',15.40,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1607400201515-c2c41c07d307?w=400'),
('ART-2038','Rinnenhaken verzinkt','Dachentwässerung',640,'Stk',150,'Regal C2-03',1.80,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1607400201515-c2c41c07d307?w=400'),
('ART-2039','Rinnenkessel Zink','Dachentwässerung',95,'Stk',20,'Regal C2-04',24.50,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1607400201515-c2c41c07d307?w=400'),
('ART-2040','Regenrohrbogen 100mm Zink','Dachentwässerung',140,'Stk',30,'Regal C2-05',9.90,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1607400201515-c2c41c07d307?w=400'),
('ART-2041','Laubschutzgitter Rinne 3m','Dachentwässerung',75,'Stk',20,'Regal C2-06',12.30,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1607400201515-c2c41c07d307?w=400'),
('ART-2042','Rinnenverbinder Zink','Dachentwässerung',210,'Stk',50,'Regal C2-07',4.20,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1607400201515-c2c41c07d307?w=400'),
-- Befestigung
('ART-2043','Dachpappnägel verzinkt 20mm','Befestigung',180,'kg',40,'Regal A1-01',3.20,'Ejot Baubefestigungen',(select id from public.lieferanten where name='Ejot Baubefestigungen'),'https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
('ART-2044','Ziegellattenschrauben 5x50','Befestigung',8500,'Stk',2000,'Regal A1-02',0.06,'Ejot Baubefestigungen',(select id from public.lieferanten where name='Ejot Baubefestigungen'),'https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
('ART-2045','Sturmklammern für Dachziegel','Befestigung',3200,'Stk',800,'Regal A1-03',0.18,'Nelskamp Dachziegel',(select id from public.lieferanten where name='Nelskamp Dachziegel'),'https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
('ART-2046','Dachschrauben mit Bohrspitze 6,3x60','Befestigung',4200,'Stk',1000,'Regal A1-04',0.14,'Ejot Baubefestigungen',(select id from public.lieferanten where name='Ejot Baubefestigungen'),'https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
('ART-2047','Bitumenschindelnägel verzinkt','Befestigung',95,'kg',20,'Regal A1-05',4.10,'Ejot Baubefestigungen',(select id from public.lieferanten where name='Ejot Baubefestigungen'),'https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
('ART-2048','Blechschrauben selbstbohrend 4,8x35','Befestigung',6800,'Stk',1500,'Regal A1-06',0.05,'Ejot Baubefestigungen',(select id from public.lieferanten where name='Ejot Baubefestigungen'),'https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
('ART-2049','Firstklammern Edelstahl','Befestigung',2100,'Stk',500,'Regal A1-07',0.22,'Nelskamp Dachziegel',(select id from public.lieferanten where name='Nelskamp Dachziegel'),'https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
('ART-2050','Holzschrauben Senkkopf 5x80','Befestigung',3600,'Stk',800,'Regal A1-08',0.09,'Würth GmbH',(select id from public.lieferanten where name='Würth GmbH'),'https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
-- Abdichtung
('ART-2051','EPDM-Dichtungsbahn 1,2mm','Abdichtung',320,'m²',60,'Regal B3-01',8.40,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400'),
('ART-2052','Butylband selbstklebend 10m','Abdichtung',68,'Rolle',15,'Regal B3-02',11.20,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400'),
('ART-2053','Silikon-Dachdichtstoff grau 310ml','Abdichtung',210,'Stk',50,'Regal B3-03',6.80,'Würth GmbH',(select id from public.lieferanten where name='Würth GmbH'),'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400'),
('ART-2054','Flüssigkunststoff Flachdach 6kg','Abdichtung',45,'Stk',10,'Regal B3-04',68.00,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400'),
('ART-2055','Bitumenkleber Kartusche','Abdichtung',130,'Stk',30,'Regal B3-05',9.50,'Icopal/BMI Deutschland',(select id from public.lieferanten where name='Icopal/BMI Deutschland'),'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400'),
('ART-2056','Dichtmanschette Dachdurchführung','Abdichtung',88,'Stk',20,'Regal B3-06',14.60,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400'),
-- Absturzsicherung
('ART-2057','Schneefanggitter verzinkt 2m','Absturzsicherung',110,'Stk',25,'Regal E1-01',32.00,'Rheinzink GmbH',(select id from public.lieferanten where name='Rheinzink GmbH'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2058','Schneefanghaken verzinkt','Absturzsicherung',480,'Stk',100,'Regal E1-02',2.40,'Nelskamp Dachziegel',(select id from public.lieferanten where name='Nelskamp Dachziegel'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2059','Dachhaken für Leiter','Absturzsicherung',34,'Stk',8,'Regal E1-03',28.50,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2060','Auffanggurt EN 361','Absturzsicherung',18,'Stk',5,'Regal E1-04',95.00,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2061','Sicherheitsseil 20m','Absturzsicherung',22,'Stk',5,'Regal E1-05',145.00,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2062','Dachschutzgeländer-Element 2m','Absturzsicherung',26,'Stk',6,'Regal E1-06',78.00,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-2063','Anschlagpunkt Dach Edelstahl','Absturzsicherung',40,'Stk',10,'Regal E1-07',55.00,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
-- Dachfenster
('ART-2064','Dachfenster Schwingfenster 78x140','Dachfenster',14,'Stk',3,'Regal F1-01',385.00,'Velux Deutschland',(select id from public.lieferanten where name='Velux Deutschland'),'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400'),
('ART-2065','Eindeckrahmen für Dachfenster','Dachfenster',16,'Stk',3,'Regal F1-02',145.00,'Velux Deutschland',(select id from public.lieferanten where name='Velux Deutschland'),'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400'),
('ART-2066','Lichtkuppel Acryl 100x100','Dachfenster',9,'Stk',2,'Regal F1-03',210.00,'Velux Deutschland',(select id from public.lieferanten where name='Velux Deutschland'),'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400'),
('ART-2067','Dachflächenfenster-Rollladen','Dachfenster',11,'Stk',2,'Regal F1-04',260.00,'Velux Deutschland',(select id from public.lieferanten where name='Velux Deutschland'),'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400'),
('ART-2068','Dachfenster-Eindeckung Schiefer','Dachfenster',12,'Stk',3,'Regal F1-05',98.00,'Velux Deutschland',(select id from public.lieferanten where name='Velux Deutschland'),'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400'),
-- PV-Montage
('ART-2069','PV-Dachhaken Universal verstellbar','PV-Montage',340,'Stk',80,'Regal F2-01',4.80,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1599577180690-71d3eb5cd00d?w=400'),
('ART-2070','Montageschiene Alu 4,2m','PV-Montage',95,'Stk',20,'Regal F2-02',32.50,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1599577180690-71d3eb5cd00d?w=400'),
('ART-2071','Schienenverbinder PV','PV-Montage',210,'Stk',50,'Regal F2-03',3.60,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1599577180690-71d3eb5cd00d?w=400'),
('ART-2072','Endklemme PV-Modul','PV-Montage',480,'Stk',100,'Regal F2-04',1.40,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1599577180690-71d3eb5cd00d?w=400'),
('ART-2073','Mittelklemme PV-Modul','PV-Montage',520,'Stk',120,'Regal F2-05',1.20,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1599577180690-71d3eb5cd00d?w=400'),
('ART-2074','Erdungsklemme PV','PV-Montage',260,'Stk',60,'Regal F2-06',2.10,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1599577180690-71d3eb5cd00d?w=400'),
-- Werkzeuge
('ART-2075','Dachdeckerhammer','Werkzeuge',12,'Stk',3,'Regal H1-01',34.90,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'),
('ART-2076','Blechschere gerade','Werkzeuge',9,'Stk',2,'Regal H1-02',28.50,'Bosch Professional',(select id from public.lieferanten where name='Bosch Professional'),'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'),
('ART-2077','Ziegelschneider elektrisch','Werkzeuge',4,'Stk',1,'Regal H1-03',320.00,'Bosch Professional',(select id from public.lieferanten where name='Bosch Professional'),'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'),
('ART-2078','Handtacker für Dachbahnen','Werkzeuge',7,'Stk',2,'Regal H1-04',45.00,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'),
('ART-2079','Fugkelle Edelstahl','Werkzeuge',15,'Stk',4,'Regal H1-05',12.80,'Rothoblaas',(select id from public.lieferanten where name='Rothoblaas'),'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'),
('ART-2080','Richtschnur 50m','Werkzeuge',20,'Stk',5,'Regal H1-06',8.90,'Würth GmbH',(select id from public.lieferanten where name='Würth GmbH'),'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'),
('ART-2081','Akku-Blechschere','Werkzeuge',3,'Stk',1,'Regal H1-07',285.00,'Bosch Professional',(select id from public.lieferanten where name='Bosch Professional'),'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'),
('ART-2082','Dachdecker-Kappsäge','Werkzeuge',2,'Stk',1,'Regal H1-08',410.00,'Bosch Professional',(select id from public.lieferanten where name='Bosch Professional'),'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'),
-- Arbeitsschutz
('ART-2083','Dachdeckerschuhe S3','Arbeitsschutz',24,'Paar',6,'Regal E2-01',89.00,'Uvex Safety',(select id from public.lieferanten where name='Uvex Safety'),'https://images.unsplash.com/photo-1599056668412-2cb2b48a6c8e?w=400'),
('ART-2084','Schutzhelm mit Kinnriemen','Arbeitsschutz',30,'Stk',8,'Regal E2-02',22.50,'Uvex Safety',(select id from public.lieferanten where name='Uvex Safety'),'https://images.unsplash.com/photo-1599056668412-2cb2b48a6c8e?w=400'),
('ART-2085','Arbeitshandschuhe Dach','Arbeitsschutz',85,'Paar',20,'Regal E2-03',6.40,'Uvex Safety',(select id from public.lieferanten where name='Uvex Safety'),'https://images.unsplash.com/photo-1599056668412-2cb2b48a6c8e?w=400'),
('ART-2086','Knieschoner','Arbeitsschutz',26,'Paar',6,'Regal E2-04',14.90,'Uvex Safety',(select id from public.lieferanten where name='Uvex Safety'),'https://images.unsplash.com/photo-1599056668412-2cb2b48a6c8e?w=400'),
('ART-2087','Warnweste orange','Arbeitsschutz',40,'Stk',10,'Regal E2-05',3.80,'Uvex Safety',(select id from public.lieferanten where name='Uvex Safety'),'https://images.unsplash.com/photo-1599056668412-2cb2b48a6c8e?w=400'),
('ART-2088','Schutzbrille getönt','Arbeitsschutz',35,'Stk',8,'Regal E2-06',8.20,'Uvex Safety',(select id from public.lieferanten where name='Uvex Safety'),'https://images.unsplash.com/photo-1599056668412-2cb2b48a6c8e?w=400'),
-- Zubehör
('ART-2089','Kaminverwahrung Blei 5m','Zubehör',18,'Rolle',4,'Regal C3-01',68.00,'Braas GmbH',(select id from public.lieferanten where name='Braas GmbH'),'https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
('ART-2090','Dunstrohrmanschette','Zubehör',60,'Stk',15,'Regal C3-02',9.40,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
('ART-2091','Antennendurchführung Dach','Zubehör',24,'Stk',6,'Regal C3-03',18.50,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
('ART-2092','Firstlüfter','Zubehör',90,'Stk',20,'Regal C3-04',6.80,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
('ART-2093','Dachkies rund 16/32 25kg','Zubehör',240,'Sack',60,'Regal C3-05',5.40,'Holzland Nord',(select id from public.lieferanten where name='Holzland Nord'),'https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
('ART-2094','Kabeldurchführung Dach','Zubehör',45,'Stk',10,'Regal C3-06',11.20,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
('ART-2095','Schneefangstopper Ziegel','Zubehör',900,'Stk',200,'Regal C3-07',0.65,'Nelskamp Dachziegel',(select id from public.lieferanten where name='Nelskamp Dachziegel'),'https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
('ART-2096','Firstband belüftet 5m','Zubehör',32,'Rolle',8,'Regal C3-08',24.00,'Klöber GmbH',(select id from public.lieferanten where name='Klöber GmbH'),'https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
-- Gerüstbau
('ART-2097','Gerüstrahmen 2,0x1,0m','Gerüstbau',46,'Stk',10,'Außenlager D3-01',65.00,'Layher Gerüstbau',(select id from public.lieferanten where name='Layher Gerüstbau'),'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400'),
('ART-2098','Gerüstbohle 3,0m','Gerüstbau',68,'Stk',15,'Außenlager D3-02',28.00,'Layher Gerüstbau',(select id from public.lieferanten where name='Layher Gerüstbau'),'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400'),
('ART-2099','Gerüstkupplung Normal','Gerüstbau',320,'Stk',80,'Außenlager D3-03',3.40,'Layher Gerüstbau',(select id from public.lieferanten where name='Layher Gerüstbau'),'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400'),
('ART-2100','Gerüstverankerung Set','Gerüstbau',55,'Stk',12,'Außenlager D3-04',14.50,'Layher Gerüstbau',(select id from public.lieferanten where name='Layher Gerüstbau'),'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400')
on conflict (nummer) do nothing;

-- ── Projekte ──
-- `projekte` has no unique constraint on name, so this uses an
-- explicit NOT EXISTS guard (same idempotency pattern as below)
-- instead of ON CONFLICT, which would silently do nothing here.
insert into public.projekte (name, kunde, rok, status, verkaufspreis, stundensatz, notiz, erstellt_von, abgeschlossen_at)
select v.name, v.kunde, v.rok::date, v.status, v.verkaufspreis, v.stundensatz, v.notiz, v.erstellt_von, v.abgeschlossen_at::timestamptz
from (values
  ('Dachsanierung Einfamilienhaus Müller','Familie Müller','2026-05-15','abgeschlossen',18500,50,'Komplette Neueindeckung inkl. Dämmung, Frankfurter Pfanne rot.','Demo-Daten','2026-05-20 16:00:00+00'),
  ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','WEG Bahnhofstraße 12','2026-08-15','aktiv',42000,55,'6 Parteien, Betondachstein anthrazit, neue Dachrinne komplett.','Demo-Daten',null),
  ('Carportdach Schmidt','Thomas Schmidt','2026-09-01','geplant',6800,0,'Pultdach, Flachdachziegel Rubin, Fertigstellung vor dem Winter.','Demo-Daten',null),
  ('Flachdachsanierung Gewerbehalle Nord','Logistik Nord GmbH','2026-06-20','pausiert',28900,52,'Wartet auf Freigabe durch Bauleitung, Material bereits teilweise verbaut.','Demo-Daten',null),
  ('PV-Montage & Dachsanierung Villa Seeblick','Familie Weber','2026-07-25','aktiv',35500,68,'Titanzink-Eindeckung plus PV-Aufständerung, 2 neue Dachfenster.','Demo-Daten',null)
) as v(name, kunde, rok, status, verkaufspreis, stundensatz, notiz, erstellt_von, abgeschlossen_at)
where not exists (select 1 from public.projekte p where p.name = v.name);

-- ── Materialplanung je Projekt ──
insert into public.projekt_material (projekt_id, artikel_id, artikel_name, artikel_nummer, einheit, geplant_menge, preis)
select p.id, a.id, a.name, a.nummer, a.einheit, m.menge, a.preis
from (values
  ('Dachsanierung Einfamilienhaus Müller','ART-2001',850),
  ('Dachsanierung Einfamilienhaus Müller','ART-2009',4),
  ('Dachsanierung Einfamilienhaus Müller','ART-2022',180),
  ('Dachsanierung Einfamilienhaus Müller','ART-2023',180),
  ('Dachsanierung Einfamilienhaus Müller','ART-2043',11),
  ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2003',2200),
  ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2010',8),
  ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2016',140),
  ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2036',60),
  ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2037',40),
  ('Carportdach Schmidt','ART-2004',220),
  ('Carportdach Schmidt','ART-2024',45),
  ('Carportdach Schmidt','ART-2026',12),
  ('Flachdachsanierung Gewerbehalle Nord','ART-2011',45),
  ('Flachdachsanierung Gewerbehalle Nord','ART-2012',8),
  ('Flachdachsanierung Gewerbehalle Nord','ART-2020',60),
  ('Flachdachsanierung Gewerbehalle Nord','ART-2051',40),
  ('PV-Montage & Dachsanierung Villa Seeblick','ART-2028',60),
  ('PV-Montage & Dachsanierung Villa Seeblick','ART-2069',220),
  ('PV-Montage & Dachsanierung Villa Seeblick','ART-2070',60),
  ('PV-Montage & Dachsanierung Villa Seeblick','ART-2072',280),
  ('PV-Montage & Dachsanierung Villa Seeblick','ART-2073',300),
  ('PV-Montage & Dachsanierung Villa Seeblick','ART-2064',2)
) as m(projekt_name, artikel_nummer, menge)
join public.projekte p on p.name = m.projekt_name
join public.artikel a on a.nummer = m.artikel_nummer
where not exists (
  select 1 from public.projekt_material pm where pm.projekt_id = p.id and pm.artikel_id = a.id
);

-- ── Zeiterfassung: laufende/abgeschlossene Arbeitszeit je Projekt ──
insert into public.projekt_zeiterfassung (projekt_id, arbeiter_anzahl, started_at, ended_at)
select p.id, z.anzahl, z.start, z.ende
from (values
  ('Dachsanierung Einfamilienhaus Müller', 2, timestamptz '2026-05-10 07:00:00+00', timestamptz '2026-05-19 16:00:00+00'),
  ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12', 2, now() - interval '3 days', null),
  ('Flachdachsanierung Gewerbehalle Nord', 2, now() - interval '10 days', now() - interval '6 days'),
  ('PV-Montage & Dachsanierung Villa Seeblick', 3, now() - interval '1 day', null)
) as z(projekt_name, anzahl, start, ende)
join public.projekte p on p.name = z.projekt_name
where not exists (select 1 from public.projekt_zeiterfassung zf where zf.projekt_id = p.id);

-- ── Bereits gebuchter Warenausgang (nutzt book_movement, damit Bestand
--    und Verlauf konsistent bleiben wie bei echten Buchungen) ──
do $$
declare
  v_row record;
begin
  for v_row in
    select * from (values
      ('Dachsanierung Einfamilienhaus Müller','ART-2001',820::numeric),
      ('Dachsanierung Einfamilienhaus Müller','ART-2009',4),
      ('Dachsanierung Einfamilienhaus Müller','ART-2022',175),
      ('Dachsanierung Einfamilienhaus Müller','ART-2023',175),
      ('Dachsanierung Einfamilienhaus Müller','ART-2043',11),
      ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2003',1100),
      ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2010',4),
      ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2016',70),
      ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2036',25),
      ('Neueindeckung Mehrfamilienhaus Bahnhofstraße 12','ART-2037',18),
      ('Flachdachsanierung Gewerbehalle Nord','ART-2011',12),
      ('Flachdachsanierung Gewerbehalle Nord','ART-2012',3),
      ('Flachdachsanierung Gewerbehalle Nord','ART-2020',15),
      ('Flachdachsanierung Gewerbehalle Nord','ART-2051',10),
      ('PV-Montage & Dachsanierung Villa Seeblick','ART-2028',15),
      ('PV-Montage & Dachsanierung Villa Seeblick','ART-2069',60),
      ('PV-Montage & Dachsanierung Villa Seeblick','ART-2070',15),
      ('PV-Montage & Dachsanierung Villa Seeblick','ART-2072',70),
      ('PV-Montage & Dachsanierung Villa Seeblick','ART-2073',75)
    ) as t(projekt_name, artikel_nummer, menge)
  loop
    -- Skip if this exact demo-consumption looks like it was already
    -- booked (idempotent re-run guard).
    if not exists (
      select 1 from public.warenbewegungen wb
      join public.artikel a on a.id = wb.artikel_id
      join public.projekte p on p.id = wb.projekt_id
      where a.nummer = v_row.artikel_nummer and p.name = v_row.projekt_name
        and wb.typ = 'ausgang' and wb.notiz = 'Demo-Verbrauch'
    ) then
      perform public.book_movement(
        (select id from public.artikel where nummer = v_row.artikel_nummer),
        'ausgang', v_row.menge, v_row.projekt_name, 'Demo-Verbrauch',
        'Demo-Daten', null,
        (select id from public.projekte where name = v_row.projekt_name)
      );
    end if;
  end loop;
end $$;

-- ============================================================
-- Done. 100 Artikel (ART-2001–ART-2100) + 5 Projekte mit Material,
-- Zeiterfassung und Verbrauch sind jetzt angelegt.
-- ============================================================
