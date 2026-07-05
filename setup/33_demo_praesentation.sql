-- ============================================================
-- StockMaster — Präsentations-Demodaten
-- Füllt die App mit erfundenen, aber realistisch verknüpften
-- Beispieldaten, damit eine Vorführung "lebendig" wirkt:
--   * Lieferanten mit vollständigen Kontaktdaten
--   * Kalender-Termine rund um heute (relativ zu current_date,
--     bleiben also immer aktuell)
--   * mehrere Inventuren (abgeschlossen mit Korrekturen für die
--     Genauigkeits-/Differenz-Statistik, eine laufende, eine
--     geplante, eine abgebrochene) über die letzten Monate verteilt,
--     damit Stat-Karten und Sparklines gefüllt sind
--   * ein paar Bestellungen in verschiedenen Status
--
-- Idempotent: erkennt am Marker erstellt_von='Demo-Import' bzw.
-- an eindeutigen Namen, ob schon geladen wurde, und überspringt dann.
-- Run after 32_inventur_erweiterung.sql.
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ── Lieferanten: Kontaktdaten auffüllen (falls aus Demo 17 vorhanden) ──
update public.lieferanten set
  email = 'vertrieb@nelskamp.example', telefon = '+49 2872 8080-0',
  ansprechpartner = 'Herr Kramer', adresse = 'Waldweg 6, 46514 Schermbeck'
where name = 'Nelskamp Dachziegel' and email = '';

update public.lieferanten set
  email = 'bestellung@rockwool.example', telefon = '+49 2043 408-0',
  ansprechpartner = 'Frau Vogt', adresse = 'Rockwool Str. 37, 45966 Gladbeck'
where name = 'Rockwool Deutschland' and email = '';

update public.lieferanten set
  email = 'service@isover.example', telefon = '+49 6203 84-0',
  ansprechpartner = 'Herr Braun', adresse = 'Isover-Platz 1, 68519 Viernheim'
where name = 'Isover Saint-Gobain' and email = '';

-- ── Neue, erfundene Lieferanten mit vollen Kontaktdaten ──
insert into public.lieferanten (name, email, telefon, ansprechpartner, adresse, notiz) values
  ('Meyer Bedachungsgroßhandel', 'einkauf@meyer-bedachung.example', '+49 221 55010-0',
   'Frau Hoffmann', 'Industriestraße 44, 50735 Köln', 'Stammlieferant Ziegel & Zubehör, 3% Skonto bei 10 Tagen'),
  ('Nordflex Abdichtungssysteme', 'kontakt@nordflex.example', '+49 40 78912-0',
   'Herr Petersen', 'Hafenstraße 118, 20457 Hamburg', 'Flachdach & Bitumen, kurzfristige Lieferung möglich'),
  ('Alpin Dämmtechnik', 'office@alpin-daemm.example', '+49 89 44120-0',
   'Frau Wagner', 'Bergstraße 9, 82467 Garmisch', 'Öko-Dämmstoffe, längere Lieferzeiten'),
  ('Solar Rooftop Supply', 'sales@solar-rooftop.example', '+49 711 66230-0',
   'Herr Yilmaz', 'Solarweg 21, 70565 Stuttgart', 'PV-Montagesysteme & Wechselrichter'),
  ('Blitz Werkzeughandel', 'shop@blitz-werkzeug.example', '+49 231 90180-0',
   'Herr Fischer', 'Am Depot 3, 44139 Dortmund', 'Werkzeug & Arbeitsschutz, Expressversand')
on conflict (name) do nothing;

-- ── Termine, Inventuren, Bestellungen (einmalig) ──
do $$
declare
  v_user text := 'Demo-Import';
  sid    bigint;  sdoc  text;
  bid    bigint;
begin
  if exists (select 1 from public.termine where erstellt_von = v_user) then
    raise notice 'Präsentations-Demodaten bereits vorhanden — übersprungen.';
    return;
  end if;

  -- ===================== KALENDER / TERMINE =====================
  -- Datumsangaben relativ zu heute, damit die Demo immer aktuell bleibt.
  insert into public.termine (titel, typ, datum, uhrzeit, ort, notiz, erledigt, erstellt_von) values
    ('Wareneingang Nelskamp – Frankfurter Pfanne', 'warenannahme', current_date,      time '08:00', 'Hauptlager',            '2 Paletten Dachziegel, Abladung mit Stapler', false, v_user),
    ('Dachsanierung Musterstraße 12',              'montage',      current_date,      time '13:30', 'Baustelle Köln',        'Eindeckung Südseite, 3 Monteure',            false, v_user),
    ('Aufmaß EFH Familie Weber',                   'kundentermin', current_date + 1,  time '09:00', 'Bonn-Beuel',            'Angebot Neueindeckung, Fotos mitnehmen',     false, v_user),
    ('Lieferung Rockwool Dämmung',                 'warenannahme', current_date + 2,  time '07:30', 'Hauptlager',            'Zwischensparrendämmung, 24 Rollen',          false, v_user),
    ('Zwischeninventur Außenlager',                'inventur',     current_date + 2,  null,          'Außenlager D1',         'Ziegelbestände abgleichen',                  false, v_user),
    ('PV-Montage Gewerbehalle',                    'montage',      current_date + 3,  time '10:00', 'Baustelle Düsseldorf',  'Aufständerung + Module, Kran bestellt',      false, v_user),
    ('Projektbesprechung Neubau Kita',             'projekt',      current_date + 5,  time '14:00', 'Büro',                  'Materialplanung & Terminkette',              false, v_user),
    ('Flachdachabdichtung Bürogebäude',            'montage',      current_date + 7,  time '08:00', 'Baustelle Essen',       'Bitumen-Schweißbahn, Brandwache',            false, v_user),
    ('Baustart Sanierung Altbau',                  'projekt',      current_date + 10, null,          'Baustelle Aachen',      'Gerüstaufbau ab 07:00',                      false, v_user),
    ('Nachbesprechung Gewährleistung',             'kundentermin', current_date - 1,  time '11:00', 'Bonn',                  'Reklamation Kaminanschluss prüfen',          false, v_user),
    ('Lieferung Titanzink-Blech',                  'warenannahme', current_date - 3,  time '09:00', 'Hauptlager',            'Erledigt, Bestand gebucht',                  true,  v_user);

  -- ===================== INVENTUREN =====================

  -- Abgeschlossen A – Jahresinventur Hauptlager (vor ~5 Monaten)
  insert into public.inventur_sessions (name, status, lager, erstellt_von, created_at, updated_at)
    values ('Jahresinventur Hauptlager 2025', 'abgeschlossen', 'Hauptlager', v_user,
            now() - interval '5 months', now() - interval '5 months' + interval '3 days')
    returning id, dokument_nr into sid, sdoc;
  insert into public.inventur_erfassungen (session_id, artikel_id, gezaehlt, von_user)
    select sid, a.id, a.menge, v_user
    from public.artikel a where a.nummer like 'ART-20%' order by a.nummer limit 40;
  insert into public.warenbewegungen (artikel_id, artikel_name, artikel_nummer, typ, menge, notiz, von_user, created_at)
    select a.id, a.name, a.nummer, 'ausgang', 40, 'Inventur-Korrektur: ' || sdoc, v_user, now() - interval '5 months' + interval '3 days'
    from public.artikel a where a.nummer = 'ART-2002';
  insert into public.warenbewegungen (artikel_id, artikel_name, artikel_nummer, typ, menge, notiz, von_user, created_at)
    select a.id, a.name, a.nummer, 'ausgang', 15, 'Inventur-Korrektur: ' || sdoc, v_user, now() - interval '5 months' + interval '3 days'
    from public.artikel a where a.nummer = 'ART-2017';
  insert into public.warenbewegungen (artikel_id, artikel_name, artikel_nummer, typ, menge, notiz, von_user, created_at)
    select a.id, a.name, a.nummer, 'eingang', 8, 'Inventur-Korrektur: ' || sdoc, v_user, now() - interval '5 months' + interval '3 days'
    from public.artikel a where a.nummer = 'ART-2024';

  -- Abgeschlossen B – Quartalsinventur Außenlager (vor ~3 Monaten)
  insert into public.inventur_sessions (name, status, lager, erstellt_von, created_at, updated_at)
    values ('Quartalsinventur Außenlager Q1', 'abgeschlossen', 'Außenlager D1', v_user,
            now() - interval '3 months', now() - interval '3 months' + interval '2 days')
    returning id, dokument_nr into sid, sdoc;
  insert into public.inventur_erfassungen (session_id, artikel_id, gezaehlt, von_user)
    select sid, a.id, a.menge, v_user
    from public.artikel a where a.nummer like 'ART-20%' order by a.nummer limit 30;
  insert into public.warenbewegungen (artikel_id, artikel_name, artikel_nummer, typ, menge, notiz, von_user, created_at)
    select a.id, a.name, a.nummer, 'ausgang', 25, 'Inventur-Korrektur: ' || sdoc, v_user, now() - interval '3 months' + interval '2 days'
    from public.artikel a where a.nummer = 'ART-2003';
  insert into public.warenbewegungen (artikel_id, artikel_name, artikel_nummer, typ, menge, notiz, von_user, created_at)
    select a.id, a.name, a.nummer, 'ausgang', 10, 'Inventur-Korrektur: ' || sdoc, v_user, now() - interval '3 months' + interval '2 days'
    from public.artikel a where a.nummer = 'ART-2005';

  -- Abgeschlossen C – Zwischeninventur Dämmstoffe (vor ~1 Monat, sehr genau)
  insert into public.inventur_sessions (name, status, lager, erstellt_von, created_at, updated_at)
    values ('Zwischeninventur Dämmstoffe', 'abgeschlossen', 'Regal B2', v_user,
            now() - interval '1 month', now() - interval '1 month' + interval '1 day')
    returning id, dokument_nr into sid, sdoc;
  insert into public.inventur_erfassungen (session_id, artikel_id, gezaehlt, von_user)
    select sid, a.id, a.menge, v_user
    from public.artikel a where a.nummer like 'ART-20%' order by a.nummer limit 20;
  insert into public.warenbewegungen (artikel_id, artikel_name, artikel_nummer, typ, menge, notiz, von_user, created_at)
    select a.id, a.name, a.nummer, 'ausgang', 30, 'Inventur-Korrektur: ' || sdoc, v_user, now() - interval '1 month' + interval '1 day'
    from public.artikel a where a.nummer = 'ART-2018';

  -- Laufend – Inventur Klempnerei (vor 2 Tagen gestartet, mit Live-Differenzen)
  insert into public.inventur_sessions (name, status, lager, erstellt_von, created_at, updated_at)
    values ('Laufende Inventur Klempnerei', 'aktiv', 'Regal C1', v_user,
            now() - interval '2 days', now() - interval '2 days')
    returning id into sid;
  insert into public.inventur_erfassungen (session_id, artikel_id, gezaehlt, von_user)
    select sid, a.id,
      case a.nummer
        when 'ART-2028' then a.menge - 5
        when 'ART-2031' then a.menge + 8
        when 'ART-2034' then a.menge - 3
        else a.menge
      end, v_user
    from public.artikel a
    where a.nummer in ('ART-2028','ART-2029','ART-2030','ART-2031','ART-2032','ART-2033',
                       'ART-2034','ART-2035','ART-2036','ART-2037','ART-2038','ART-2039');

  -- Geplant – Inventur Werkzeuglager (noch nicht gestartet)
  insert into public.inventur_sessions (name, status, lager, erstellt_von, created_at, updated_at)
    values ('Geplante Inventur Werkzeuglager', 'geplant', 'Werkstatt', v_user, now(), now());

  -- Abgebrochen – Zählung Gerüstbau (vor ~6 Wochen abgebrochen)
  insert into public.inventur_sessions (name, status, lager, erstellt_von, created_at, updated_at)
    values ('Abgebrochene Zählung Gerüstbau', 'abgebrochen', 'Außenlager D3', v_user,
            now() - interval '6 weeks', now() - interval '6 weeks' + interval '4 hours')
    returning id into sid;
  insert into public.inventur_erfassungen (session_id, artikel_id, gezaehlt, von_user)
    select sid, a.id, a.menge, v_user
    from public.artikel a where a.nummer like 'ART-20%' order by a.nummer limit 5;

  -- ===================== BESTELLUNGEN =====================

  -- Bestellung 1 – eingetroffen (Nelskamp)
  insert into public.bestellungen (lieferant_id, status, notiz, erstellt_von, gesendet_at, eingetroffen_at, created_at)
    values ((select id from public.lieferanten where name = 'Nelskamp Dachziegel'),
            'eingetroffen', 'Nachbestellung Frankfurter Pfanne', v_user,
            now() - interval '12 days', now() - interval '5 days', now() - interval '14 days')
    returning id into bid;
  insert into public.bestellung_positionen (bestellung_id, artikel_id, artikel_name, artikel_nummer, einheit, menge)
    select bid, a.id, a.name, a.nummer, a.einheit, 1500 from public.artikel a where a.nummer = 'ART-2001';
  insert into public.bestellung_positionen (bestellung_id, artikel_id, artikel_name, artikel_nummer, einheit, menge)
    select bid, a.id, a.name, a.nummer, a.einheit, 120 from public.artikel a where a.nummer = 'ART-2005';

  -- Bestellung 2 – gesendet (Rockwool)
  insert into public.bestellungen (lieferant_id, status, notiz, erstellt_von, gesendet_at, created_at)
    values ((select id from public.lieferanten where name = 'Rockwool Deutschland'),
            'gesendet', 'Dämmung für Projekt Neubau Kita', v_user,
            now() - interval '3 days', now() - interval '4 days')
    returning id into bid;
  insert into public.bestellung_positionen (bestellung_id, artikel_id, artikel_name, artikel_nummer, einheit, menge)
    select bid, a.id, a.name, a.nummer, a.einheit, 60 from public.artikel a where a.nummer = 'ART-2017';
  insert into public.bestellung_positionen (bestellung_id, artikel_id, artikel_name, artikel_nummer, einheit, menge)
    select bid, a.id, a.name, a.nummer, a.einheit, 40 from public.artikel a where a.nummer = 'ART-2020';

  -- Bestellung 3 – Entwurf (Isover)
  insert into public.bestellungen (lieferant_id, status, notiz, erstellt_von, created_at)
    values ((select id from public.lieferanten where name = 'Isover Saint-Gobain'),
            'entwurf', 'Angebot anfragen', v_user, now() - interval '1 day')
    returning id into bid;
  insert into public.bestellung_positionen (bestellung_id, artikel_id, artikel_name, artikel_nummer, einheit, menge)
    select bid, a.id, a.name, a.nummer, a.einheit, 12 from public.artikel a where a.nummer = 'ART-2019';

  raise notice 'Präsentations-Demodaten geladen: Termine, Inventuren, Bestellungen.';
end $$;

-- ============================================================
-- Fertig.
-- ============================================================
