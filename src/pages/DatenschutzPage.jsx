import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import Icon from '../components/Icon'
import { useLanguage } from '../hooks/useLanguage'

export default function DatenschutzPage() {
  const { t } = useLanguage()
  const [firma, setFirma] = useState(null)

  useEffect(() => {
    supabase.from('firmendaten').select('*').eq('id', 1).single().then(({ data }) => setFirma(data))
  }, [])

  const abschnitte = [
    {
      titel: '1. Verantwortlicher',
      text: `${firma?.name || '[Firmenname]'}, ${firma?.adresse || '[Adresse]'}${firma?.email ? `, ${firma.email}` : ''}${firma?.telefon ? `, ${firma.telefon}` : ''} ist verantwortlich im Sinne der Datenschutz-Grundverordnung (DSGVO) für die Verarbeitung personenbezogener Daten in dieser Anwendung.`,
    },
    {
      titel: '2. Welche Daten werden verarbeitet',
      text: 'Name und E-Mail-Adresse der angemeldeten Mitarbeiter, Zeitpunkt und Inhalt von Lager- und Projektbuchungen (wer welchen Artikel wann gebucht hat), sowie Kontaktdaten von Lieferanten, die im System hinterlegt werden.',
    },
    {
      titel: '3. Zweck der Verarbeitung',
      text: 'Die Daten dienen ausschließlich der internen Lager-, Bestell- und Projektverwaltung sowie der Nachvollziehbarkeit von Warenbewegungen (Art. 6 Abs. 1 lit. b und f DSGVO).',
    },
    {
      titel: '4. Speicherung und Hosting',
      text: 'Die Daten werden bei Supabase (Auftragsverarbeiter) auf Servern innerhalb der EU gespeichert. Mit dem Hosting-Anbieter besteht ein Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO.',
    },
    {
      titel: '5. Speicherdauer',
      text: 'Personenbezogene Daten werden so lange gespeichert, wie es für die genannten Zwecke oder gesetzliche Aufbewahrungspflichten (z. B. handels- und steuerrechtliche Vorgaben) erforderlich ist.',
    },
    {
      titel: '6. Rechte der Betroffenen',
      text: 'Jeder Nutzer hat das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung seiner Daten sowie ein Beschwerderecht bei der zuständigen Aufsichtsbehörde.',
    },
    {
      titel: '7. Kontakt',
      text: `Anfragen zum Datenschutz richten Sie bitte an: ${firma?.email || '[E-Mail-Adresse]'}`,
    },
  ]

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-2xl">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-semibold mb-1">{t('nav_datenschutz')}</h1>
        <p className="text-secondary text-sm">Datenschutzerklärung gemäß Art. 13 DSGVO</p>
      </div>

      <div className="flex items-start gap-2 bg-amber-dim border border-amber/40 rounded-xl p-3 mb-5 text-xs text-amber">
        <Icon name="alert" size={15} color="#e8821c" className="mt-0.5 shrink-0" />
        <span>Dies ist ein generischer Textbaustein und ersetzt keine rechtliche Prüfung. Bitte vor Veröffentlichung von einem Anwalt oder Steuerberater gegenprüfen lassen.</span>
      </div>

      <Card className="p-4 sm:p-5 space-y-5">
        {abschnitte.map(a => (
          <div key={a.titel}>
            <h2 className="font-semibold text-sm mb-1.5">{a.titel}</h2>
            <p className="text-sm text-secondary leading-relaxed">{a.text}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}
