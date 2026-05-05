import { useEffect, useState } from 'react'
import { useUnreadCount } from '../hooks/useUnreadCount'
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Image, FlatList, ActivityIndicator
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { supabase } from '../lib/supabase'

const ROSE  = '#C994A7'
const GREEN = '#4A635D'
const BLUSH = '#EBE0E3'

const CATEGORIES = ['All', 'Tops', 'Bottoms', 'Accessories']
const RADII      = [1, 5, 10, 25, 50]

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371
    const dL = (lat2 - lat1) * Math.PI / 180
    const dN = (lng2 - lng1) * Math.PI / 180
    const a  = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dN/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function formatDist(km: number) {
    if (km < 1)  return `${Math.round(km * 1000)} m`
    if (km < 10) return `${km.toFixed(1)} km`
    return `${Math.round(km)} km`
}

export default function DashboardScreen() {
    const router = useRouter()
    const [userName, setUserName]   = useState('Swapper')
    const [points, setPoints]       = useState(0)
    const [items, setItems]         = useState<any[]>([])
    const [filtered, setFiltered]   = useState<any[]>([])
    const [activecat, setActivecat] = useState('All')
    const [loading, setLoading]     = useState(true)

    // Location filter state
    const [locActive, setLocActive]   = useState(false)
    const [locLoading, setLocLoading] = useState(false)
    const [userLat, setUserLat]       = useState<number | null>(null)
    const [userLng, setUserLng]       = useState<number | null>(null)
    const [radiusKm, setRadiusKm]     = useState(5)

    useEffect(() => {
        loadUser()
        loadItems()
    }, [])

    useEffect(() => {
        applyFilters(items, activecat, locActive, userLat, userLng, radiusKm)
    }, [items, activecat, locActive, userLat, userLng, radiusKm])

    async function loadUser() {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.replace('/login' as any); return }
        const { data: profile } = await supabase
            .from('profiles').select('username, display_name, avatar_url, pts')
            .eq('id', session.user.id).single()
        if (profile) {
            setUserName(profile.display_name || profile.username || 'Swapper')
            setPoints(profile.pts || 0)
        }
    }

    async function loadItems() {
        setLoading(true)
        const { data } = await supabase.from('items').select('*').order('created_at', { ascending: false })
        const allItems = data || []
        setItems(allItems)
        setLoading(false)
    }

    function applyFilters(
        allItems: any[], cat: string,
        locOn: boolean, lat: number | null, lng: number | null, radius: number
    ) {
        let result = allItems.filter(i =>
            cat === 'All' || i.category?.toLowerCase() === cat.toLowerCase()
        )

        if (locOn && lat !== null && lng !== null) {
            result = result
                .map(item => ({
                    ...item,
                    _distKm: (item.latitude && item.longitude)
                        ? haversineKm(lat, lng, item.latitude, item.longitude)
                        : 99999
                }))
                .filter(item => item._distKm <= radius || item._distKm === 99999)
                .sort((a, b) => a._distKm - b._distKm)
        }

        setFiltered(result)
    }

    async function toggleLocationFilter() {
        if (locActive) {
            setLocActive(false)
            setUserLat(null)
            setUserLng(null)
            return
        }
        setLocLoading(true)
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
            setLocLoading(false)
            return
        }
        const loc = await Location.getCurrentPositionAsync({})
        setUserLat(loc.coords.latitude)
        setUserLng(loc.coords.longitude)
        setLocActive(true)
        setLocLoading(false)
    }

    const unreadCount = useUnreadCount()

    function filterByCategory(cat: string) {
        setActivecat(cat)
    }

    async function handleLogout() {
        await supabase.auth.signOut()
        router.replace('/login' as any)
    }

    return (
        <View style={styles.container}>

            {/* HEADER */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.greeting}>Welcome back,</Text>
                    <Text style={styles.userName}>{userName}</Text>
                </View>
                <View style={styles.headerRight}>
                   <TouchableOpacity style={styles.pointsBadge} onPress={() => router.push('/wallet' as any)}>
    <Ionicons name="card-outline" size={14} color={GREEN} />
    <Text style={styles.pointsText}>{points.toLocaleString()} pts</Text>
</TouchableOpacity>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                        <Ionicons name="log-out-outline" size={22} color={ROSE} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* CATEGORY FILTER */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.catScroll}
                contentContainerStyle={styles.catContainer}>
                {CATEGORIES.map(cat => (
                    <TouchableOpacity
                        key={cat}
                        style={[styles.catBtn, activecat === cat && styles.catBtnActive]}
                        onPress={() => filterByCategory(cat)}>
                        <Text style={[styles.catText, activecat === cat && styles.catTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* LOCATION FILTER BAR */}
            <View style={styles.locBar}>
                <TouchableOpacity
                    style={[styles.locBtn, locActive && styles.locBtnActive]}
                    onPress={toggleLocationFilter}
                    disabled={locLoading}>
                    {locLoading
                        ? <ActivityIndicator size="small" color={locActive ? '#fff' : ROSE} />
                        : <Ionicons name="location-outline" size={14} color={locActive ? '#fff' : ROSE} />
                    }
                    <Text style={[styles.locBtnText, locActive && styles.locBtnTextActive]}>
                        {locActive ? 'Nearest First ✓' : 'Nearest First'}
                    </Text>
                </TouchableOpacity>

                {locActive && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.radiusScroll} contentContainerStyle={styles.radiusContainer}>
                        {RADII.map(r => (
                            <TouchableOpacity
                                key={r}
                                style={[styles.radiusChip, radiusKm === r && styles.radiusChipActive]}
                                onPress={() => setRadiusKm(r)}>
                                <Text style={[styles.radiusText, radiusKm === r && styles.radiusTextActive]}>
                                    {r} km
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>

            {/* ITEMS GRID */}
            {loading ? (
                <ActivityIndicator color={ROSE} size="large" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    numColumns={2}
                    contentContainerStyle={styles.grid}
                    columnWrapperStyle={styles.row}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="location-outline" size={48} color="#ddd" />
                            <Text style={styles.emptyTitle}>
                                {locActive ? 'No items nearby' : 'No items found'}
                            </Text>
                            <Text style={styles.emptyText}>
                                {locActive ? 'Try increasing the radius or browse all items.' : 'Check back later!'}
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.card}
                            onPress={() => router.push(`/item/${item.id}` as any)}>
                            <Image
                                source={{ uri: item.images?.[0] || item.image || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400' }}
                                style={styles.cardImage}
                            />
                            {/* Distance badge */}
                            {locActive && item._distKm !== undefined && item._distKm < 99999 && (
                                <View style={styles.distBadge}>
                                    <Ionicons name="location" size={9} color="#fff" />
                                    <Text style={styles.distText}>{formatDist(item._distKm)}</Text>
                                </View>
                            )}
                            <View style={styles.cardInfo}>
                                <Text style={styles.cardCat}>{item.category}</Text>
                                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.cardPts}>{item.pts?.toLocaleString()} pts</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}

            {/* BOTTOM NAV */}
            <View style={styles.bottomNav}>
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home' as any)}>
                    <Ionicons name="home-outline" size={22} color="#bbb" />
                    <Text style={styles.navText}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem}>
                    <Ionicons name="grid" size={22} color={ROSE} />
                    <Text style={[styles.navText, { color: ROSE }]}>Catalog</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/post' as any)}>
                    <Ionicons name="add-circle-outline" size={22} color="#bbb" />
                    <Text style={styles.navText}>Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/messages' as any)}>
                    <View style={styles.navIconWrap}>
                        <Ionicons name="chatbubble-outline" size={22} color="#bbb" />
                        {unreadCount > 0 && (
                            <View style={styles.navBadge}>
                                <Text style={styles.navBadgeText}>{unreadCount}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.navText}>Messages</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/profile' as any)}>
                    <Ionicons name="person-outline" size={22} color="#bbb" />
                    <Text style={styles.navText}>Profile</Text>
                </TouchableOpacity>
            </View>

        </View>
    )
}

const styles = StyleSheet.create({
    container:        { flex: 1, backgroundColor: '#FDFBFC' },
    header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f0f2' },
    greeting:         { fontSize: 13, color: '#999' },
    userName:         { fontSize: 20, fontWeight: '700', color: GREEN },
    headerRight:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pointsBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BLUSH, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 50 },
    pointsText:       { fontSize: 13, fontWeight: '700', color: GREEN },
    logoutBtn:        { padding: 6 },

    // FIX: removed fixed height, tightened padding so pills fit properly
    catScroll:        { flexShrink: 0, borderBottomWidth: 1, borderBottomColor: '#f5f0f2' },
    catContainer:     { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
    catBtn:           { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 25, borderWidth: 1.5, borderColor: '#eee', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    catBtnActive:     { backgroundColor: GREEN, borderColor: GREEN },
    catText:          { fontSize: 13, fontWeight: '700', color: '#333' },
    catTextActive:    { color: '#fff' },

    locBar:           { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#f5f0f2', flexWrap: 'wrap' },
    locBtn:           { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50, borderWidth: 1.5, borderColor: '#f0dfe5', backgroundColor: '#faf4f6' },
    locBtnActive:     { backgroundColor: ROSE, borderColor: ROSE },
    locBtnText:       { fontSize: 12.5, fontWeight: '700', color: ROSE },
    locBtnTextActive: { color: '#fff' },
    radiusScroll:     { flexShrink: 1 },
    radiusContainer:  { flexDirection: 'row', gap: 6 },
    radiusChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 50, borderWidth: 1.5, borderColor: '#eee', backgroundColor: '#fff' },
    radiusChipActive: { backgroundColor: GREEN, borderColor: GREEN },
    radiusText:       { fontSize: 12, fontWeight: '600', color: '#bbb' },
    radiusTextActive: { color: '#fff' },
    grid:             { padding: 12 },
    row:              { justifyContent: 'space-between' },
    card:             { width: '48%', backgroundColor: '#fff', borderRadius: 16, marginBottom: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
    cardImage:        { width: '100%', height: 180, backgroundColor: BLUSH },
    distBadge:        { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(74,99,93,0.88)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    distText:         { fontSize: 10, fontWeight: '700', color: '#fff' },
    cardInfo:         { padding: 10 },
    cardCat:          { fontSize: 10, color: ROSE, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    cardName:         { fontSize: 13, fontWeight: '700', color: '#1a1a1a', marginTop: 2 },
    cardPts:          { fontSize: 12, color: GREEN, fontWeight: '600', marginTop: 4 },
    empty:            { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyTitle:       { fontSize: 15, fontWeight: '700', color: '#aaa' },
    emptyText:        { fontSize: 13, color: '#bbb', textAlign: 'center' },
    bottomNav:        { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f5f0f2', paddingBottom: 24, paddingTop: 12 },
    navItem:          { flex: 1, alignItems: 'center', gap: 4 },
    navText:          { fontSize: 11, color: '#bbb', fontWeight: '600' },
    navIconWrap:      { position: 'relative' },
    navBadge:         { position: 'absolute', top: -4, right: -6, backgroundColor: '#C994A7', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#fff' },
    navBadgeText:     { color: '#fff', fontSize: 9, fontWeight: '800' },
})