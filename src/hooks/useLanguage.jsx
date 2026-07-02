import { createContext, useContext, useState } from 'react'
import { translations } from '../lib/translations'

const LanguageContext = createContext(null)
const STORAGE_KEY = 'stockmaster-lang'

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'en' ? 'en' : 'de'
  })

  const toggleLang = () => setLang(l => {
    const next = l === 'de' ? 'en' : 'de'
    localStorage.setItem(STORAGE_KEY, next)
    return next
  })

  // Only translates UI chrome keys registered in translations.js —
  // article names, categories, customer names etc. are never passed
  // through this and always render as entered.
  const t = (key) => translations[lang]?.[key] ?? translations.de[key] ?? key

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider')
  return ctx
}
