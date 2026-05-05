import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useUnreadCount() {
    const [unreadCount, setUnreadCount] = useState(0)
    const [userId, setUserId]           = useState<string | null>(null)

    // Step 1 — get user once
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) setUserId(session.user.id)
        })
    }, [])

    // Step 2 — fetch + subscribe once we have userId
    useEffect(() => {
        if (!userId) return

        fetchCount(userId)

        const channel = supabase
            .channel(`unread-${userId}`)
            .on('postgres_changes', {
                event:  '*',
                schema: 'public',
                table:  'messages',
                filter: `to_user_id=eq.${userId}`
            }, () => fetchCount(userId))
            .subscribe()

        // Cleanup is properly returned to useEffect here
        return () => { supabase.removeChannel(channel) }
    }, [userId])

    async function fetchCount(uid: string) {
        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('to_user_id', uid)
            .eq('read', false)
        setUnreadCount(count || 0)
    }

    return unreadCount
}