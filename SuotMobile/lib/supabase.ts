import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = 'https://ltsgzhgmpkfqlrmuwdbn.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0c2d6aGdtcGtmcWxybXV3ZGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNjY4OTQsImV4cCI6MjA4NzY0Mjg5NH0.boFXXeyy6pUnEYZpxoUCR7dM8yUndozcGyn1XgeE4Es'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
        params: {
            eventsPerSecond: 10
        },
        transport: typeof WebSocket !== 'undefined' ? WebSocket : undefined,
        timeout: 20000,
    }
})