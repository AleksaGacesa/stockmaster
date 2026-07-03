import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Who's currently logged in, live — Supabase Realtime Presence needs no
// table/RLS of its own (pure WebSocket broadcast), so this is just a
// channel every authenticated session joins and "checks in" on. The
// roster (everyone who could log in) still comes from profiles; this
// hook only adds the live online/offline layer on top of it.
export function useOnlinePresence() {
  const { profile } = useAuth()
  const [roster, setRoster] = useState([])
  const [onlineIds, setOnlineIds] = useState(() => new Set())

  useEffect(() => {
    supabase.from('profiles').select('id, display_name, role').order('display_name')
      .then(({ data }) => { if (data) setRoster(data) })
  }, [])

  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase.channel('online-team', {
      config: { presence: { key: String(profile.id) } },
    })
    channel
      .on('presence', { event: 'sync' }, () => {
        setOnlineIds(new Set(Object.keys(channel.presenceState())))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') channel.track({ online_at: new Date().toISOString() })
      })
    return () => supabase.removeChannel(channel)
  }, [profile?.id])

  return { roster, onlineIds }
}
