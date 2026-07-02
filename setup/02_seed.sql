-- ============================================================
-- StockMaster Seed Data — 20 Test Articles
-- Paste in SQL Editor AFTER running 01_schema.sql
-- ============================================================
insert into public.artikel (nummer, name, kategorie, menge, einheit, mindestbestand, lagerort, preis, lieferant, bild) values
('ART-1001','Sechskantschraube M8x40','Schrauben',4500,'Stk',1000,'Regal A1-03',0.08,'Würth GmbH','https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
('ART-1002','Stahlblech verzinkt 2mm','Bleche',85,'m²',50,'Regal B2-01',24.50,'ThyssenKrupp','https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
('ART-1003','Kabelbinder 200mm schwarz','Elektro',12000,'Stk',2000,'Regal C1-05',0.03,'Conrad Electronic','https://images.unsplash.com/photo-1620283085439-39620a1e21c5?w=400'),
('ART-1004','Hydrauliköl HLP 32','Schmierstoffe',18,'L',20,'Regal D3-02',6.90,'Fuchs Petrolub','https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
('ART-1005','Schutzhandschuhe Größe L','Arbeitsschutz',340,'Paar',100,'Regal E1-01',3.20,'Uvex Safety','https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-1006','Aluminiumprofil 40x40','Profile',220,'m',150,'Regal A2-04',5.40,'Bosch Rexroth','https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400'),
('ART-1007','Kugellager 6204-2RS','Lager',6,'Stk',25,'Regal F1-02',4.10,'SKF Deutschland','https://images.unsplash.com/photo-1599577180690-71d3eb5cd00d?w=400'),
('ART-1008','Schweißdraht G3Si1 1.0mm','Schweißtechnik',45,'kg',30,'Regal D1-03',3.80,'Lincoln Electric','https://images.unsplash.com/photo-1565008576549-57569a49371d?w=400'),
('ART-1009','PVC-Rohr DN50','Rohre',130,'m',80,'Regal B3-01',2.95,'Geberit','https://images.unsplash.com/photo-1607400201515-c2c41c07d307?w=400'),
('ART-1010','Dichtungsring NBR 20x3','Dichtungen',850,'Stk',300,'Regal C2-02',0.45,'Freudenberg Sealing','https://images.unsplash.com/photo-1518770660439-4636190af475?w=400'),
('ART-1011','Sicherheitsbrille klar','Arbeitsschutz',28,'Stk',50,'Regal E1-02',4.50,'Uvex Safety','https://images.unsplash.com/photo-1599056668412-2cb2b48a6c8e?w=400'),
('ART-1012','Elektromotor 1.5kW 3-phasig','Antriebstechnik',14,'Stk',5,'Regal G1-01',185.00,'Siemens AG','https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400'),
('ART-1013','Holzpalette EUR 1200x800','Verpackung',95,'Stk',40,'Außenlager L2',12.00,'PalettenWerk Nord','https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=400'),
('ART-1014','Isolierband schwarz 19mm','Elektro',3,'Rolle',50,'Regal C1-06',1.10,'Conrad Electronic','https://images.unsplash.com/photo-1620283085439-39620a1e21c5?w=400'),
('ART-1015','Gabelstapler-Ersatzgabel','Ersatzteile',4,'Stk',2,'Regal G2-03',240.00,'Linde Material Handling','https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400'),
('ART-1016','Holzschrauben 4x30 verzinkt','Schrauben',7200,'Stk',1500,'Regal A1-04',0.04,'Würth GmbH','https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=400'),
('ART-1017','Pneumatikschlauch 8x6mm','Pneumatik',310,'m',100,'Regal D2-01',0.65,'Festo AG','https://images.unsplash.com/photo-1635348521683-7e0c9b8f8c47?w=400'),
('ART-1018','Akkubohrschrauber 18V','Werkzeuge',9,'Stk',4,'Regal H1-01',119.00,'Bosch Professional','https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'),
('ART-1019','Reinigungstuch Microfaser','Reinigung',450,'Stk',200,'Regal E2-01',0.85,'Kärcher','https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400'),
('ART-1020','Förderband-Rolle 50mm','Fördertechnik',2,'Stk',6,'Regal G3-02',38.50,'Interroll Holding','https://images.unsplash.com/photo-1565514020179-026b92b2d70b?w=400');
