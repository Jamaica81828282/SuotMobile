import { useEffect, useState, useCallback } from 'react'
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, RefreshControl, Animated, Dimensions
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'

const ROSE   = '#C994A7'
const GREEN  = '#4A635D'
const BLUSH  = '#EBE0E3'
const PURPLE = '#7a5c6e'
const { width } = Dimensions.get('window')

// ── Types ──────────────────────────────────────────────────────
type BufferEntry = {
    id: string
    remaining: number
    expires_at: string
    created_at: string
}

type WalletEvent = {
    id: string
    event_type: 'topup' | 'overflow' | 'refill' | 'spend' | 'earn' | 'admin' | 'expired'
    from_wallet: string
    to_wallet: string
    amount: number
    note: string | null
    created_at: string
}

// ── Helpers ────────────────────────────────────────────────────
function daysUntil(iso: string) {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
}

function timeAgo(iso: string) {
    const d = Date.now() - new Date(iso).getTime()
    const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000)
    if (m < 1)  return 'just now'
    if (m < 60) return `${m}m ago`
    if (h < 24) return `${h}h ago`
    if (dy < 7) return `${dy}d ago`
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const EVENT_META: Record<string, { label: string; icon: string; badgeColor: string; iconColor: string }> = {
    topup:    { label: 'Top Up',            icon: 'add-circle-outline',      badgeColor: '#e8f4f0', iconColor: GREEN   },
    overflow: { label: 'Overflow to Buffer', icon: 'git-branch-outline',      badgeColor: '#fdf0f5', iconColor: ROSE    },
    refill:   { label: 'Buffer Auto-Refill', icon: 'refresh-circle-outline',  badgeColor: '#fff7ed', iconColor: '#f97316' },
    spend:    { label: 'Points Spent',       icon: 'trending-down-outline',   badgeColor: '#fef2f2', iconColor: '#ef4444' },
    earn:     { label: 'Points Earned',      icon: 'trending-up-outline',     badgeColor: '#f0fdf4', iconColor: '#22c55e' },
    admin:    { label: 'Admin Adjustment',   icon: 'shield-checkmark-outline', badgeColor: '#f5f3ff', iconColor: '#7c3aed' },
    expired:  { label: 'Buffer Expired',     icon: 'close-circle-outline',    badgeColor: '#fef2f2', iconColor: '#ef4444' },
}

const WALLET_NAMES: Record<string, string> = {
    active: 'Active', buffer: 'Buffer', external: 'External'
}

// ══════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════
export default function WalletScreen() {
    const router = useRouter()
    const [loading, setLoading]           = useState(true)
    const [refreshing, setRefreshing]     = useState(false)
    const [pts, setPts]                   = useState(0)
    const [buffer, setBuffer]             = useState(0)
    const [bufferEntries, setBufferEntries] = useState<BufferEntry[]>([])
    const [events, setEvents]             = useState<WalletEvent[]>([])
    const [capAnim]                       = useState(new Animated.Value(0))

    useEffect(() => { loadAll() }, [])

    async function loadAll() {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.replace('/login' as any); return }
        await Promise.all([loadBalances(session.user.id), loadEvents(session.user.id)])
        setLoading(false)
    }

    async function loadBalances(uid: string) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('pts, circulation_buffer')
            .eq('id', uid)
            .single()
        if (profile) {
            setPts(profile.pts || 0)
            setBuffer(profile.circulation_buffer || 0)
            Animated.timing(capAnim, {
                toValue: Math.min((profile.pts || 0) / 2500, 1),
                duration: 800,
                useNativeDriver: false,
            }).start()
        }

        // Load buffer entries
        const { data: entries } = await supabase
            .from('buffer_entries')
            .select('id, remaining, expires_at, created_at')
            .eq('user_id', uid)
            .gt('remaining', 0)
            .order('expires_at', { ascending: true })
        setBufferEntries(entries || [])
    }

    async function loadEvents(uid: string) {
        const { data } = await supabase
            .from('wallet_events')
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(50)
        setEvents(data || [])
    }

    const onRefresh = useCallback(async () => {
        setRefreshing(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) await Promise.all([loadBalances(session.user.id), loadEvents(session.user.id)])
        setRefreshing(false)
    }, [])

    // ── Expiry banners ──────────────────────────────────────────
    const urgentEntries  = bufferEntries.filter(e => daysUntil(e.expires_at) <= 3)
    const warningEntries = bufferEntries.filter(e => { const d = daysUntil(e.expires_at); return d > 3 && d <= 7 })
    const urgentPts      = urgentEntries.reduce((s, e) => s + e.remaining, 0)
    const warningPts     = warningEntries.reduce((s, e) => s + e.remaining, 0)

    if (loading) return (
        <View style={s.loadWrap}>
            <ActivityIndicator color={GREEN} size="large" />
        </View>
    )

    const capWidth = capAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

    return (
        <ScrollView
            style={s.root}
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
        >
            {/* ── Header ── */}
            <View style={s.header}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={20} color="#666" />
                </TouchableOpacity>
                <View>
                    <Text style={s.headerTitle}>My Wallet</Text>
                    <Text style={s.headerSub}>Pasa-Points balance & circulation buffer</Text>
                </View>
            </View>

            {/* ── Expiry banners ── */}
            {urgentEntries.length > 0 && (
                <View style={[s.banner, s.bannerUrgent]}>
                    <Ionicons name="alert-circle" size={18} color="#b91c1c" />
                    <View style={{ flex: 1 }}>
                        <Text style={[s.bannerTitle, { color: '#b91c1c' }]}>
                            ⚠️ {urgentPts.toLocaleString()} pts expiring in {daysUntil(urgentEntries[0].expires_at) <= 1 ? 'less than a day' : `${daysUntil(urgentEntries[0].expires_at)} days`}!
                        </Text>
                        <Text style={[s.bannerDesc, { color: '#b91c1c' }]}>Swap items now to trigger an auto-refill before they're lost.</Text>
                    </View>
                </View>
            )}
            {!urgentEntries.length && warningEntries.length > 0 && (
                <View style={[s.banner, s.bannerWarning]}>
                    <Ionicons name="warning" size={18} color="#92400e" />
                    <View style={{ flex: 1 }}>
                        <Text style={[s.bannerTitle, { color: '#92400e' }]}>
                            {warningPts.toLocaleString()} pts expiring in {daysUntil(warningEntries[0].expires_at)} days
                        </Text>
                        <Text style={[s.bannerDesc, { color: '#92400e' }]}>Keep swapping to use your buffer before it expires!</Text>
                    </View>
                </View>
            )}

            {/* ── Balance cards ── */}
            <View style={s.cardsRow}>
                {/* Active balance */}
                <View style={[s.card, s.cardActive]}>
                    <View style={s.cardGlow} />
                    <Text style={s.cardLabel}>
                        <Ionicons name="card-outline" size={10} color="rgba(255,255,255,.6)" />  ACTIVE BALANCE
                    </Text>
                    <Text style={s.cardAmount}>{pts.toLocaleString()}<Text style={s.cardUnit}> pts</Text></Text>
                    <Text style={s.cardSub}>Cap: 2,500 pts · Spendable on swaps</Text>
                    <View style={s.capBarWrap}>
                        <View style={s.capBarLabels}>
                            <Text style={s.capBarLabel}>0</Text>
                            <Text style={s.capBarLabel}>2,500 cap</Text>
                        </View>
                        <View style={s.capBarTrack}>
                            <Animated.View style={[s.capBarFill, { width: capWidth }]} />
                        </View>
                    </View>
                </View>

                {/* Buffer balance */}
                <View style={[s.card, s.cardBuffer]}>
                    <View style={s.cardGlow} />
                    <Text style={s.cardLabel}>
                        <Ionicons name="sparkles-outline" size={10} color="rgba(255,255,255,.6)" />  CIRCULATION BUFFER
                    </Text>
                    <Text style={s.cardAmount}>{buffer.toLocaleString()}<Text style={s.cardUnit}> pts</Text></Text>
                    <Text style={s.cardSub}>Expires in 30 days · Auto-refills active</Text>
                    {bufferEntries.length === 0 ? (
                        <View style={s.bufferEmpty}>
                            <Text style={s.bufferEmptyTxt}>No buffer points yet</Text>
                        </View>
                    ) : (
                        <View style={{ marginTop: 14, gap: 6 }}>
                            {bufferEntries.slice(0, 3).map(e => {
                                const days = daysUntil(e.expires_at)
                                const tagStyle = days <= 3 ? s.tagUrgent : days <= 7 ? s.tagWarning : s.tagOk
                                const tagTxtStyle = days <= 3 ? s.tagTxtUrgent : days <= 7 ? s.tagTxtWarning : s.tagTxtOk
                                return (
                                    <View key={e.id} style={s.bufferRow}>
                                        <View>
                                            <Text style={s.bufferPts}>{e.remaining.toLocaleString()} pts</Text>
                                            <Text style={s.bufferDate}>Expires {fmtDate(e.expires_at)}</Text>
                                        </View>
                                        <View style={[s.bufferTag, tagStyle]}>
                                            <Text style={[s.bufferTagTxt, tagTxtStyle]}>{days}d{days <= 3 ? '!' : ''}</Text>
                                        </View>
                                    </View>
                                )
                            })}
                            {bufferEntries.length > 3 && (
                                <View style={[s.bufferRow, { opacity: 0.6 }]}>
                                    <Text style={s.bufferPts}>
                                        +{bufferEntries.slice(3).reduce((s, e) => s + e.remaining, 0).toLocaleString()} pts more
                                    </Text>
                                    <Text style={s.bufferDate}>{bufferEntries.length - 3} more batch{bufferEntries.length - 3 > 1 ? 'es' : ''}</Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </View>

            {/* ── Actions ── */}
            <View style={s.actionsRow}>
                <TouchableOpacity style={s.btnPrimary} onPress={() => router.push('/topup' as any)}>
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={s.btnPrimaryTxt}>Top Up Points</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSecondary} onPress={onRefresh}>
                    <Ionicons name="refresh" size={16} color={GREEN} />
                    <Text style={s.btnSecondaryTxt}>Refresh</Text>
                </TouchableOpacity>
            </View>

            {/* ── How it works ── */}
            <View style={s.infoBox}>
                <View style={s.infoIcon}>
                    <Ionicons name="information-circle-outline" size={18} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.infoTitle}>How Pasa-Points Circulation Works</Text>
                    <Text style={s.infoBody}>
                        Your <Text style={s.infoGreen}>Active Wallet</Text> is capped at <Text style={s.infoGreen}>2,500 pts</Text> for all swaps. Points beyond the cap overflow into the <Text style={s.infoGreen}>Circulation Buffer</Text>. When your active balance hits <Text style={s.infoGreen}>500 pts or below</Text>, the buffer auto-tops you back up to 2,500 pts. <Text style={s.infoGreen}>Buffer points expire in 30 days</Text> — keep swapping!
                    </Text>
                </View>
            </View>

            {/* ── Transaction history ── */}
            <View style={s.historySection}>
                <View style={s.historyHeader}>
                    <Text style={s.historyTitle}>Transaction History</Text>
                    <View style={s.historyBadge}>
                        <Text style={s.historyBadgeTxt}>{events.length}</Text>
                    </View>
                </View>

                <View style={s.historyTable}>
                    {events.length === 0 ? (
                        <View style={s.emptyWrap}>
                            <Ionicons name="receipt-outline" size={36} color="#ddd" />
                            <Text style={s.emptyTxt}>No transactions yet</Text>
                        </View>
                    ) : events.map((ev, i) => {
                        const meta = EVENT_META[ev.event_type] || EVENT_META.admin
                        const isPositive = ev.to_wallet === 'active'
                        const isNegative = ev.event_type === 'expired' || (ev.from_wallet === 'active' && ev.to_wallet === 'external')
                        const amtColor = isPositive ? '#22c55e' : isNegative ? '#ef4444' : '#9a9a9a'
                        const prefix   = isPositive ? '+' : isNegative ? '−' : ''
                        return (
                            <View key={ev.id} style={[s.eventRow, i === events.length - 1 && { borderBottomWidth: 0 }]}>
                                <View style={[s.eventBadge, { backgroundColor: meta.badgeColor }]}>
                                    <Ionicons name={meta.icon as any} size={16} color={meta.iconColor} />
                                </View>
                                <View style={s.eventBody}>
                                    <Text style={s.eventLabel}>{meta.label}</Text>
                                    {ev.note ? <Text style={s.eventNote} numberOfLines={1}>{ev.note}</Text> : null}
                                    <Text style={s.eventWallet}>
                                        {WALLET_NAMES[ev.from_wallet] || ev.from_wallet} → {WALLET_NAMES[ev.to_wallet] || ev.to_wallet}
                                    </Text>
                                </View>
                                <View style={s.eventRight}>
                                    <Text style={[s.eventAmt, { color: amtColor }]}>
                                        {prefix}{ev.amount.toLocaleString()} pts
                                    </Text>
                                    <Text style={s.eventTime}>{timeAgo(ev.created_at)}</Text>
                                </View>
                            </View>
                        )
                    })}
                </View>
            </View>

            <View style={{ height: 32 }} />
        </ScrollView>
    )
}

// ══════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
    root:        { flex: 1, backgroundColor: '#FDFBFC' },
    content:     { padding: 20, paddingTop: 56 },
    loadWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDFBFC' },

    // Header
    header:      { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
    backBtn:     { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: '#ede8ea', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: 'serif', fontSize: 26, fontWeight: '800', color: '#1a1a1a' },
    headerSub:   { fontSize: 12, color: '#9a9a9a', marginTop: 2 },

    // Banners
    banner:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, marginBottom: 14 },
    bannerUrgent:  { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
    bannerWarning: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
    bannerTitle:   { fontSize: 13, fontWeight: '700', marginBottom: 2 },
    bannerDesc:    { fontSize: 12, opacity: 0.8, lineHeight: 18 },

    // Cards
    cardsRow:    { flexDirection: 'column', gap: 14, marginBottom: 20 },
    card:        { borderRadius: 24, padding: 24, overflow: 'hidden', position: 'relative' },
    cardActive:  { backgroundColor: GREEN, shadowColor: GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
    cardBuffer:  { backgroundColor: PURPLE, shadowColor: PURPLE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 8 },
    cardGlow:    { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)' },
    cardLabel:   { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.2, marginBottom: 10, textTransform: 'uppercase' },
    cardAmount:  { fontSize: 48, fontWeight: '800', color: '#fff', lineHeight: 52 },
    cardUnit:    { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
    cardSub:     { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 },

    // Cap bar
    capBarWrap:   { marginTop: 18 },
    capBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    capBarLabel:  { fontSize: 10.5, color: 'rgba(255,255,255,0.55)' },
    capBarTrack:  { height: 5, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
    capBarFill:   { height: '100%', borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.75)' },

    // Buffer entries
    bufferEmpty:    { marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
    bufferEmptyTxt: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
    bufferRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.10)' },
    bufferPts:      { fontSize: 13, fontWeight: '700', color: '#fff' },
    bufferDate:     { fontSize: 10.5, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
    bufferTag:      { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 50 },
    tagUrgent:      { backgroundColor: 'rgba(239,68,68,0.25)' },
    tagWarning:     { backgroundColor: 'rgba(245,158,11,0.25)' },
    tagOk:          { backgroundColor: 'rgba(255,255,255,0.15)' },
    bufferTagTxt:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    tagTxtUrgent:   { color: '#fca5a5' },
    tagTxtWarning:  { color: '#fde68a' },
    tagTxtOk:       { color: 'rgba(255,255,255,0.75)' },

    // Actions
    actionsRow:     { flexDirection: 'row', gap: 10, marginBottom: 20 },
    btnPrimary:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: GREEN, paddingVertical: 13, borderRadius: 50, shadowColor: GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
    btnPrimaryTxt:  { color: '#fff', fontSize: 13, fontWeight: '700' },
    btnSecondary:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#fff', paddingVertical: 13, paddingHorizontal: 20, borderRadius: 50, borderWidth: 1.5, borderColor: '#ede8ea' },
    btnSecondaryTxt:{ color: GREEN, fontSize: 13, fontWeight: '700' },

    // Info box
    infoBox:   { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ede8ea', borderRadius: 18, padding: 18, marginBottom: 28, flexDirection: 'row', gap: 14 },
    infoIcon:  { width: 38, height: 38, borderRadius: 12, backgroundColor: '#f0f5f4', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    infoTitle: { fontSize: 13, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
    infoBody:  { fontSize: 12, color: '#9a9a9a', lineHeight: 20 },
    infoGreen: { color: GREEN, fontWeight: '700' },

    // History
    historySection: { marginBottom: 8 },
    historyHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    historyTitle:   { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
    historyBadge:   { backgroundColor: '#faf4f6', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 50 },
    historyBadgeTxt:{ fontSize: 11, fontWeight: '700', color: '#9a9a9a' },
    historyTable:   { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#ede8ea', overflow: 'hidden' },

    eventRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f8f4f6' },
    eventBadge: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    eventBody:  { flex: 1, minWidth: 0 },
    eventLabel: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
    eventNote:  { fontSize: 11, color: '#9a9a9a', marginTop: 1 },
    eventWallet:{ fontSize: 11, color: '#bbb', marginTop: 2 },
    eventRight: { alignItems: 'flex-end', flexShrink: 0 },
    eventAmt:   { fontSize: 13, fontWeight: '700' },
    eventTime:  { fontSize: 11, color: '#9a9a9a', marginTop: 2 },

    emptyWrap:  { padding: 48, alignItems: 'center', gap: 10 },
    emptyTxt:   { fontSize: 13, color: '#9a9a9a' },
})