-- ============================================================
-- StockMaster — Kontaktdaten für alle übrigen Lieferanten
-- Ergänzt Telefon, E-Mail, Ansprechpartner und Adresse bei den
-- (älteren) Demo-Lieferanten, die in Seed 33 leer geblieben sind.
-- Überschreibt nie echte Daten: jedes Update greift nur, solange
-- email noch leer ist. Am Ende füllt ein Catch-All alle sonst noch
-- leeren Lieferanten mit plausiblen Platzhaltern, damit keiner in
-- der Präsentation leer wirkt.
-- Run after 33_demo_praesentation.sql. Beliebig oft wiederholbar.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

update public.lieferanten set email='vertrieb@braas.example',       telefon='+49 6104 407-0',   ansprechpartner='Herr Schneider', adresse='Frankfurter Landstr. 2-4, 61440 Oberursel'   where name='Braas GmbH'               and email='';
update public.lieferanten set email='office@bramac.example',        telefon='+49 8362 707-0',   ansprechpartner='Frau Bauer',     adresse='Bramacstraße 9, 87642 Halblech'            where name='Bramac Dachsysteme'       and email='';
update public.lieferanten set email='info@kloeber.example',         telefon='+49 2103 26-0',    ansprechpartner='Herr Lang',      adresse='Klöberweg 3, 40724 Hilden'                 where name='Klöber GmbH'              and email='';
update public.lieferanten set email='service@bmigroup.example',     telefon='+49 6431 96-0',    ansprechpartner='Frau Krüger',    adresse='Frankfurter Str. 88, 65549 Limburg'        where name='Icopal/BMI Deutschland'   and email='';
update public.lieferanten set email='einkauf@holzland-nord.example',telefon='+49 511 8703-0',   ansprechpartner='Herr Meier',     adresse='Holzweg 15, 30539 Hannover'                where name='Holzland Nord'            and email='';
update public.lieferanten set email='kontakt@rheinzink.example',    telefon='+49 2363 605-0',   ansprechpartner='Frau Schulz',    adresse='Bahnhofstr. 90, 45711 Datteln'             where name='Rheinzink GmbH'           and email='';
update public.lieferanten set email='info@prefa.example',           telefon='+49 271 6900-0',   ansprechpartner='Herr Wolf',      adresse='Aluminiumstr. 2, 98634 Wasungen'           where name='Prefa Aluminiumprodukte'  and email='';
update public.lieferanten set email='bau@ejot.example',             telefon='+49 2751 529-0',   ansprechpartner='Herr Richter',   adresse='Im Herrengarten 1, 57319 Bad Berleburg'    where name='Ejot Baubefestigungen'    and email='';
update public.lieferanten set email='info@rothoblaas.example',      telefon='+49 8035 8737-0',  ansprechpartner='Frau Moser',     adresse='Etschweg 2a, 83080 Oberaudorf'             where name='Rothoblaas'               and email='';
update public.lieferanten set email='service@velux.example',        telefon='+49 40 54707-0',   ansprechpartner='Herr Hansen',    adresse='Gazellenkamp 168, 22527 Hamburg'           where name='Velux Deutschland'        and email='';
update public.lieferanten set email='vertrieb@layher.example',      telefon='+49 7135 70-0',    ansprechpartner='Herr Weiß',      adresse='Ochsenbacher Str. 56, 74363 Güglingen'     where name='Layher Gerüstbau'         and email='';
update public.lieferanten set email='shop@wuerth.example',          telefon='+49 7940 15-0',    ansprechpartner='Frau Fischer',   adresse='Reinhold-Würth-Str. 12, 74653 Künzelsau'   where name='Würth GmbH'               and email='';
update public.lieferanten set email='profi@bosch.example',          telefon='+49 711 400-0',    ansprechpartner='Herr Berger',    adresse='Robert-Bosch-Platz 1, 70839 Gerlingen'     where name='Bosch Professional'       and email='';
update public.lieferanten set email='safety@uvex.example',          telefon='+49 911 9736-0',   ansprechpartner='Frau König',     adresse='Würzburger Str. 181, 90766 Fürth'          where name='Uvex Safety'              and email='';

-- ── Catch-All: alle sonst noch leeren Lieferanten füllen ──
update public.lieferanten set
  email           = 'info@' || lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) || '.example',
  telefon         = '+49 30 ' || lpad((1000 + (id % 9000))::text, 4, '0') || '-0',
  ansprechpartner = 'Vertrieb / Kundenservice',
  adresse         = 'Musterstraße ' || (1 + (id % 99))::text || ', Deutschland'
where email = '';

-- ============================================================
-- Fertig.
-- ============================================================
