import { useEffect, useRef, useState } from 'react'
import { useUnreadCount } from '../hooks/useUnreadCount'
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, FlatList, ActivityIndicator, Modal, TextInput,
    Dimensions, Animated, KeyboardAvoidingView, Platform,
    Alert, Pressable, StatusBar
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'

const ROSE      = '#C994A7'
const GREEN     = '#4A635D'
const BLUSH     = '#EBE0E3'
const SCREEN_W  = Dimensions.get('window').width
const GRID_CELL = (SCREEN_W - 3) / 3   // 3-col with 1.5px gaps

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────
type Profile = {
    id: string
    username: string
    display_name: string
    bio: string
    avatar_url: string | null
    pts: number
    followers_count: number
    following_count: number
    email?: string
}
type Item = {
    id: string; name: string; category: string; brand: string
    description: string; size: string; condition: string
    pts: number; tags: string[]; images: string[]; created_at: string
}
type Story = { id: string; image_url: string; label: string; created_at: string; viewed?: boolean }
type Comment = {
    id: string; text: string; created_at: string; parent_comment_id: string | null
    profiles: { id: string; display_name: string; username: string; avatar_url: string | null }
}
type FollowUser = {
    id: string; display_name: string; username: string; avatar_url: string | null
    isFollowing?: boolean
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function timeAgo(iso: string) {
    const d = Date.now() - new Date(iso).getTime()
    const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000)
    if (m < 1)  return 'just now'
    if (m < 60) return `${m}m`
    if (h < 24) return `${h}h`
    if (dy < 7) return `${dy}d`
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}
function av(name: string, url: string | null) {
    return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=EBE0E3&color=C994A7&size=200`
}

// ─────────────────────────────────────────────
//  COMPONENT
// ─────────────────────────────────────────────
export default function ProfileScreen() {
    const router      = useRouter()
    const unreadCount = useUnreadCount()

    // core
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [profile,     setProfile]     = useState<Profile | null>(null)
    const [items,       setItems]       = useState<Item[]>([])
    const [stories,     setStories]     = useState<Story[]>([])
    const [followers,   setFollowers]   = useState(0)
    const [following,   setFollowing]   = useState(0)
    const [loading,     setLoading]     = useState(true)
    const [activeTab,   setActiveTab]   = useState<'posts' | 'saved' | 'wishlist'>('posts')
    const [wishlistItems, setWishlistItems] = useState<Item[]>([])

    // lightbox
    const [lbVisible,   setLbVisible]   = useState(false)
    const [lbIdx,       setLbIdx]       = useState(0)
    const [lbItem,      setLbItem]      = useState<Item | null>(null)
    const [comments,    setComments]    = useState<Comment[]>([])
    const [cmtLoading,  setCmtLoading]  = useState(false)
    const [cmtText,     setCmtText]     = useState('')
    const [cmtPosting,  setCmtPosting]  = useState(false)

    // story viewer
    const [svVisible,   setSvVisible]   = useState(false)
    const [svIdx,       setSvIdx]       = useState(0)
    const svProgress    = useRef(new Animated.Value(0)).current
    const svAnim        = useRef<Animated.CompositeAnimation | null>(null)

    // story label modal
    const [labelModal,   setLabelModal]   = useState(false)
    const [pendingUri,   setPendingUri]   = useState<string | null>(null)
    const [storyLabel,   setStoryLabel]   = useState('')
    const [storyPosting, setStoryPosting] = useState(false)

    // edit profile
    const [editVisible,   setEditVisible]   = useState(false)
    const [editName,      setEditName]      = useState('')
    const [editUsername,  setEditUsername]  = useState('')
    const [editBio,       setEditBio]       = useState('')
    const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null)
    const [editSaving,    setEditSaving]    = useState(false)

    // follow modal
    const [fmType,    setFmType]    = useState<'followers' | 'following'>('followers')
    const [fmVisible, setFmVisible] = useState(false)
    const [fmList,    setFmList]    = useState<FollowUser[]>([])
    const [fmLoading, setFmLoading] = useState(false)

    // ── Boot ─────────────────────────────────────
    useEffect(() => { boot() }, [])

    async function boot() {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.replace('/login' as any); return }
        setCurrentUser(session.user)

        const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        if (!prof) { router.replace('/login' as any); return }
        setProfile(prof)

        const [
            { data: myItems },
            { count: fc },
            { count: gc },
            { data: rawStories },
            { data: wlData }
        ] = await Promise.all([
            supabase.from('items').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', session.user.id),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', session.user.id),
            supabase.from('stories').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
            supabase.from('wishlist').select('*, items(*)').eq('user_id', session.user.id).order('created_at', { ascending: false })
        ])

        setItems(myItems || [])
        setFollowers(fc || 0)
        setFollowing(gc || 0)
        setWishlistItems((wlData || []).map((r: any) => r.items).filter(Boolean))

        const cutoff = Date.now() - 24 * 60 * 60 * 1000
        const validStories = (rawStories || []).filter((s: Story) => new Date(s.created_at).getTime() > cutoff)

        // Fetch which of my own stories I've already "viewed" (i.e. opened) from DB
        // so the ring stays grey even after a reload
        const storyIds = validStories.map((s: Story) => s.id)
        let viewedSet = new Set<string>()
        if (storyIds.length) {
            const { data: viewedRows } = await supabase
                .from('story_views')
                .select('story_id')
                .eq('viewer_id', session.user.id)
                .in('story_id', storyIds)
            viewedSet = new Set((viewedRows || []).map((r: any) => r.story_id))
        }
        // Owner's own stories: mark as viewed if they've been seen (ring grey)
        // For own stories we mark all as viewed since they're yours
        setStories(validStories.map((s: Story) => ({ ...s, viewed: true })))
        setLoading(false)
    }

    // ── Story upload ─────────────────────────────
    async function pickStory() {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (perm.status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow photo access to post a story.')
            return
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
            allowsEditing: true,
            aspect: [9, 16],
        })
        if (result.canceled || !result.assets[0]) return
        setPendingUri(result.assets[0].uri)
        setStoryLabel('')
        setLabelModal(true)
    }

    async function submitStory() {
        if (!pendingUri || !profile) return
        setStoryPosting(true)
        try {
            // ✅ FIX: Use FormData with direct URI — the correct approach in React Native / Expo.
            // Using fetch() + blob() on a local file URI does NOT work reliably in RN.
            const ext      = pendingUri.split('.').pop() || 'jpg'
            const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
            const path     = `stories/${profile.id}/${Date.now()}.${ext}`

            const formData = new FormData()
            formData.append('file', { uri: pendingUri, name: `story.${ext}`, type: mimeType } as any)

            const { error: upErr } = await supabase.storage
                .from('stories')
                .upload(path, formData as any, { contentType: mimeType, upsert: true })

            if (upErr) throw upErr

            const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(path)

            const { data: newStory, error: dbErr } = await supabase
                .from('stories')
                .insert({ user_id: profile.id, image_url: publicUrl, label: storyLabel.trim() || 'Story' })
                .select()
                .single()

            if (dbErr) throw dbErr

            setStories(prev => [{ ...newStory, viewed: true }, ...prev])
            setLabelModal(false)
            setPendingUri(null)
        } catch (e: any) {
            Alert.alert('Upload failed', e?.message || 'Could not post story. Try again.')
        } finally {
            setStoryPosting(false)
        }
    }

    // ── Story viewer ─────────────────────────────
    function openStory(idx: number) {
        // Mark all own stories as viewed when opening any of them
        setStories(prev => prev.map(s => ({ ...s, viewed: true })))
        setSvIdx(idx)
        setSvVisible(true)
        runStoryProgress(idx)
    }

    function runStoryProgress(idx: number) {
        svProgress.setValue(0)
        svAnim.current?.stop()
        svAnim.current = Animated.timing(svProgress, {
            toValue: 1, duration: 5000, useNativeDriver: false
        })
        svAnim.current.start(({ finished }) => { if (finished) advanceStory(idx) })
    }

    function advanceStory(idx: number) {
        const next = idx + 1
        if (next < stories.length) { setSvIdx(next); runStoryProgress(next) }
        else setSvVisible(false)
    }

    // ── Lightbox ─────────────────────────────────
    async function openLb(idx: number) {
        setLbIdx(idx); setLbItem(items[idx]); setLbVisible(true)
        await loadComments(items[idx].id)
    }

    async function loadComments(itemId: string) {
        setCmtLoading(true)
        const { data } = await supabase
            .from('item_comments')
            .select('*, profiles(id, display_name, username, avatar_url)')
            .eq('item_id', itemId)
            .order('created_at', { ascending: true })
        setComments(data || [])
        setCmtLoading(false)
    }

    function lbNav(dir: number) {
        const next = lbIdx + dir
        if (next < 0 || next >= items.length) return
        setLbIdx(next); setLbItem(items[next]); loadComments(items[next].id)
    }

    async function postComment() {
        if (!cmtText.trim() || !lbItem || cmtPosting) return
        setCmtPosting(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setCmtPosting(false); return }
        const { data: saved } = await supabase
            .from('item_comments')
            .insert({ item_id: lbItem.id, user_id: session.user.id, text: cmtText.trim() })
            .select('*, profiles(id, display_name, username, avatar_url)')
            .single()
        if (saved) { setComments(p => [...p, saved]); setCmtText('') }
        setCmtPosting(false)
    }

    async function confirmDelete(itemId: string) {
        Alert.alert('Delete Item', 'This will permanently delete the item.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    await supabase.from('items').delete().eq('id', itemId)
                    setItems(p => p.filter(i => i.id !== itemId))
                    setLbVisible(false)
                }
            }
        ])
    }

    // ── Edit profile ─────────────────────────────
    function openEdit() {
        if (!profile) return
        setEditName(profile.display_name || '')
        setEditUsername(profile.username || '')
        setEditBio(profile.bio || '')
        setEditAvatarUri(null)
        setEditVisible(true)
    }

    async function pickEditAvatar() {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.9, allowsEditing: true, aspect: [1, 1]
        })
        if (!result.canceled) setEditAvatarUri(result.assets[0].uri)
    }

    async function saveProfile() {
        if (!editName.trim())     { Alert.alert('Error', 'Display name is required'); return }
        if (!editUsername.trim()) { Alert.alert('Error', 'Username is required'); return }
        setEditSaving(true)

        const updates: any = {
            display_name: editName.trim(),
            username:     editUsername.trim(),
            bio:          editBio.trim()
        }

        if (editAvatarUri && profile) {
            try {
                const ext  = editAvatarUri.split('.').pop() || 'jpg'
                const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
                const path = `avatars/${profile.id}.${ext}`
                const fd   = new FormData()
                fd.append('file', { uri: editAvatarUri, name: `avatar.${ext}`, type: mime } as any)
                const { error: upErr } = await supabase.storage
                    .from('avatars')
                    .upload(path, fd as any, { contentType: mime, upsert: true })
                if (!upErr) {
                    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
                    updates.avatar_url = publicUrl
                }
            } catch (_) {}
        }

        const { error } = await supabase.from('profiles').update(updates).eq('id', profile!.id)
        setEditSaving(false)
        if (error) {
            Alert.alert('Error', error.message.includes('unique') ? 'Username already taken.' : error.message)
            return
        }
        setProfile(p => p ? { ...p, ...updates } : p)
        setEditVisible(false)
    }

    // ── Follow modal ─────────────────────────────
    async function openFollowModal(type: 'followers' | 'following') {
        setFmType(type); setFmVisible(true); setFmLoading(true)

        let users: FollowUser[] = []
        if (type === 'followers') {
            const { data } = await supabase
                .from('follows')
                .select('profiles!follows_follower_id_fkey(id, display_name, username, avatar_url)')
                .eq('following_id', profile?.id)
            users = (data || []).map((r: any) => r.profiles).filter(Boolean)
        } else {
            const { data } = await supabase
                .from('follows')
                .select('profiles!follows_following_id_fkey(id, display_name, username, avatar_url)')
                .eq('follower_id', profile?.id)
            users = (data || []).map((r: any) => r.profiles).filter(Boolean)
        }

        // Check which of these users the current user is already following
        if (users.length && currentUser) {
            const ids = users.map(u => u.id)
            const { data: myFollows } = await supabase
                .from('follows').select('following_id')
                .eq('follower_id', currentUser.id).in('following_id', ids)
            const followingSet = new Set((myFollows || []).map((r: any) => r.following_id))
            users = users.map(u => ({ ...u, isFollowing: followingSet.has(u.id) }))
        }

        setFmList(users)
        setFmLoading(false)
    }

    async function toggleFollowUser(userId: string, currently: boolean) {
        if (!currentUser) return
        // Optimistic update
        setFmList(prev => prev.map(u =>
            u.id === userId ? { ...u, isFollowing: !currently } : u
        ))
        if (currently) {
            await supabase.from('follows').delete()
                .eq('follower_id', currentUser.id).eq('following_id', userId)
        } else {
            await supabase.from('follows').insert(
                { follower_id: currentUser.id, following_id: userId }
            )
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut()
        router.replace('/login' as any)
    }

    // ── Render ───────────────────────────────────
    if (loading) return (
        <View style={s.centered}><ActivityIndicator color={ROSE} size="large" /></View>
    )
    if (!profile) return null

    const dName      = profile.display_name || profile.username || 'Swapper'
    const avatarSrc  = av(dName, profile.avatar_url)
    const hasStories = stories.length > 0
    const allViewed  = stories.length > 0 && stories.every(s => s.viewed)

    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" />

            {/* ── HEADER ─────────────────────────── */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.hBtn}>
                    <Ionicons name="arrow-back" size={22} color="#1a1a1a" />
                </TouchableOpacity>
                <Text style={s.hTitle}>{profile.username}</Text>
                <TouchableOpacity onPress={handleLogout} style={s.hBtn}>
                    <Ionicons name="log-out-outline" size={22} color={ROSE} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

                {/* ── PROFILE INFO ───────────────── */}
                <View style={s.profileRow}>
                    {/* Avatar — tapping opens stories if any exist */}
                    <TouchableOpacity
                        onPress={() => hasStories && openStory(0)}
                        activeOpacity={hasStories ? 0.85 : 1}>
                        <View style={[
                            s.avatarRing,
                            hasStories && !allViewed && s.avatarRingLit,
                            hasStories && allViewed  && s.avatarRingViewed,
                        ]}>
                            <Image source={{ uri: avatarSrc }} style={s.avatar} />
                        </View>
                    </TouchableOpacity>

                    {/* Stats */}
                    <View style={s.statsRow}>
                        <View style={s.stat}>
                            <Text style={s.statNum}>{items.length}</Text>
                            <Text style={s.statLbl}>posts</Text>
                        </View>
                        <TouchableOpacity style={s.stat} onPress={() => openFollowModal('followers')}>
                            <Text style={s.statNum}>{followers}</Text>
                            <Text style={s.statLbl}>followers</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.stat} onPress={() => openFollowModal('following')}>
                            <Text style={s.statNum}>{following}</Text>
                            <Text style={s.statLbl}>following</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Name + bio */}
                <View style={s.bioWrap}>
                    <Text style={s.bioName}>{dName}</Text>
                    {!!profile.bio && <Text style={s.bioText}>{profile.bio}</Text>}
                    <View style={s.profileBtns}>
                        <TouchableOpacity style={s.profileBtn} onPress={openEdit}>
                            <Text style={s.profileBtnTxt}>Edit profile</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.profileBtn} onPress={pickStory}>
                            <Text style={s.profileBtnTxt}>Add story</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── TAB BAR ────────────────────── */}
                <View style={s.tabBar}>
                    <TouchableOpacity
                        style={[s.tab, activeTab === 'posts' && s.tabActive]}
                        onPress={() => setActiveTab('posts')}>
                        <Ionicons name="grid-outline" size={22} color={activeTab === 'posts' ? '#1a1a1a' : '#aaa'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.tab, activeTab === 'saved' && s.tabActive]}
                        onPress={() => setActiveTab('saved')}>
                        <Ionicons name="bookmark-outline" size={22} color={activeTab === 'saved' ? '#1a1a1a' : '#aaa'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.tab, activeTab === 'wishlist' && s.tabActive]}
                        onPress={() => setActiveTab('wishlist')}>
                        <Ionicons name="heart-outline" size={22} color={activeTab === 'wishlist' ? '#1a1a1a' : '#aaa'} />
                    </TouchableOpacity>
                </View>

                {/* ── GRID ───────────────────────── */}
                {(() => {
                    const displayItems = activeTab === 'wishlist' ? wishlistItems : items
                    if (displayItems.length === 0) return (
                        <View style={s.empty}>
                            <View style={s.emptyCircle}>
                                <Ionicons
                                    name={activeTab === 'wishlist' ? 'heart-outline' : 'camera-outline'}
                                    size={36} color="#ccc" />
                            </View>
                            <Text style={s.emptyH}>
                                {activeTab === 'wishlist' ? 'No Saved Items' : 'Share Photos'}
                            </Text>
                            <Text style={s.emptyP}>
                                {activeTab === 'wishlist'
                                    ? 'Items you save from the catalog will appear here.'
                                    : "When you post items, they'll appear on your profile."}
                            </Text>
                            {activeTab !== 'wishlist' && (
                                <TouchableOpacity onPress={() => router.push('/post' as any)}>
                                    <Text style={s.emptyLink}>Share your first photo</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )
                    return (
                        <View style={s.grid}>
                            {displayItems.map((item, idx) => (
                                <TouchableOpacity key={item.id} onPress={() => openLb(idx)} activeOpacity={0.92}>
                                    <Image
                                        source={{ uri: item.images?.[0] || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400' }}
                                        style={s.gridCell}
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )
                })()}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* ── BOTTOM NAV ─────────────────────── */}
            <View style={s.nav}>
                <TouchableOpacity style={s.navItem} onPress={() => router.push('/home' as any)}>
                    <Ionicons name="home-outline" size={24} color="#aaa" />
                    <Text style={s.navTxt}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem} onPress={() => router.push('/dashboard' as any)}>
                    <Ionicons name="grid-outline" size={24} color="#aaa" />
                    <Text style={s.navTxt}>Catalog</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem} onPress={() => router.push('/post' as any)}>
                    <Ionicons name="add-circle-outline" size={24} color="#aaa" />
                    <Text style={s.navTxt}>Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem} onPress={() => router.push('/messages' as any)}>
                    <View style={s.navIconWrap}>
                        <Ionicons name="chatbubble-outline" size={24} color="#aaa" />
                        {unreadCount > 0 && (
                            <View style={s.badge}><Text style={s.badgeTxt}>{unreadCount}</Text></View>
                        )}
                    </View>
                    <Text style={s.navTxt}>Messages</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem}>
                    <Ionicons name="person" size={24} color="#1a1a1a" />
                    <Text style={[s.navTxt, { color: '#1a1a1a' }]}>Profile</Text>
                </TouchableOpacity>
            </View>

            {/* ══════════════════════════════════
                LIGHTBOX
            ══════════════════════════════════ */}
            <Modal visible={lbVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLbVisible(false)}>
                <View style={s.lbRoot}>
                    <View style={s.lbHdr}>
                        <Image source={{ uri: avatarSrc }} style={s.lbHdrAv} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.lbHdrName}>{profile.username || dName}</Text>
                            <Text style={s.lbHdrSub}>{lbItem ? timeAgo(lbItem.created_at) : ''}</Text>
                        </View>
                        <TouchableOpacity onPress={() => lbNav(-1)}
                            style={[s.lbNavBtn, lbIdx === 0 && { opacity: 0.25 }]}
                            disabled={lbIdx === 0}>
                            <Ionicons name="chevron-back" size={18} color="#555" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => lbNav(1)}
                            style={[s.lbNavBtn, lbIdx === items.length - 1 && { opacity: 0.25 }]}
                            disabled={lbIdx === items.length - 1}>
                            <Ionicons name="chevron-forward" size={18} color="#555" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setLbVisible(false)} style={{ paddingLeft: 6 }}>
                            <Ionicons name="close" size={22} color="#555" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Image
                            source={{ uri: lbItem?.images?.[0] || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800' }}
                            style={s.lbImg}
                        />

                        {lbItem && (
                            <View style={s.lbBody}>
                                <View style={s.lbTitleRow}>
                                    <Text style={s.lbName}>{lbItem.name}</Text>
                                    <Text style={s.lbPts}>{(lbItem.pts || 0).toLocaleString()} pts</Text>
                                </View>

                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                                    {[
                                        { l: 'Size', v: lbItem.size || '—' },
                                        { l: 'Condition', v: lbItem.condition || '—' },
                                        { l: 'Category', v: lbItem.category || '—' },
                                        { l: 'Brand', v: lbItem.brand || 'Unbranded' },
                                    ].map(m => (
                                        <View key={m.l} style={s.pill}>
                                            <Text style={s.pillLbl}>{m.l}</Text>
                                            <Text style={s.pillVal}>{m.v}</Text>
                                        </View>
                                    ))}
                                </ScrollView>

                                {lbItem.tags?.length > 0 && (
                                    <View style={s.tagsRow}>
                                        {lbItem.tags.map(t => (
                                            <View key={t} style={s.tagChip}>
                                                <Text style={s.tagChipTxt}>#{t}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {!!lbItem.description && (
                                    <Text style={s.lbDesc}>{lbItem.description}</Text>
                                )}

                                <View style={s.lbActions}>
                                    <TouchableOpacity style={s.lbEditBtn}
                                        onPress={() => { setLbVisible(false); router.push(`/edit-item/${lbItem.id}` as any) }}>
                                        <Ionicons name="pencil-outline" size={15} color={GREEN} />
                                        <Text style={s.lbEditTxt}>Edit Item</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.lbDelBtn} onPress={() => confirmDelete(lbItem.id)}>
                                        <Ionicons name="trash-outline" size={15} color="#e74c3c" />
                                        <Text style={s.lbDelTxt}>Delete</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={s.divider} />

                                <Text style={s.cmtHeading}>Comments</Text>
                                {cmtLoading
                                    ? <ActivityIndicator color={ROSE} style={{ marginVertical: 16 }} />
                                    : comments.length === 0
                                        ? <Text style={s.cmtEmpty}>No comments yet — be the first!</Text>
                                        : comments.map(c => {
                                            const cp    = c.profiles || {} as any
                                            const cName = cp.display_name || cp.username || 'User'
                                            return (
                                                <View key={c.id} style={s.cmtRow}>
                                                    <Image source={{ uri: av(cName, cp.avatar_url) }} style={s.cmtAv} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={s.cmtBody}>
                                                            <Text style={s.cmtUsr}>{cName}  </Text>
                                                            {c.text}
                                                        </Text>
                                                        <Text style={s.cmtTime}>{timeAgo(c.created_at)}</Text>
                                                    </View>
                                                </View>
                                            )
                                        })
                                }
                            </View>
                        )}
                    </ScrollView>

                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={s.cmtBar}>
                            <Image source={{ uri: avatarSrc }} style={s.cmtBarAv} />
                            <TextInput
                                style={s.cmtInput}
                                placeholder="Add a comment…"
                                placeholderTextColor="#bbb"
                                value={cmtText}
                                onChangeText={setCmtText}
                                returnKeyType="send"
                                onSubmitEditing={postComment}
                            />
                            <TouchableOpacity onPress={postComment} disabled={!cmtText.trim() || cmtPosting}>
                                {cmtPosting
                                    ? <ActivityIndicator size="small" color={ROSE} />
                                    : <Text style={[s.cmtPost, { opacity: cmtText.trim() ? 1 : 0.3 }]}>Post</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ══════════════════════════════════
                STORY VIEWER
            ══════════════════════════════════ */}
            <Modal visible={svVisible} animationType="fade" statusBarTranslucent onRequestClose={() => setSvVisible(false)}>
                <View style={s.svRoot}>
                    <View style={s.svProgressRow}>
                        {stories.map((_, i) => (
                            <View key={i} style={s.svTrack}>
                                <Animated.View style={[s.svFill, {
                                    width: i < svIdx ? '100%'
                                        : i === svIdx
                                            ? svProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                                            : '0%'
                                }]} />
                            </View>
                        ))}
                    </View>

                    <View style={s.svHdr}>
                        <Image source={{ uri: avatarSrc }} style={s.svHdrAv} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.svHdrName}>{dName}</Text>
                            <Text style={s.svHdrTime}>{stories[svIdx] ? timeAgo(stories[svIdx].created_at) : ''}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSvVisible(false)} style={{ padding: 8 }}>
                            <Ionicons name="close" size={26} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {stories[svIdx] && (
                        <Image source={{ uri: stories[svIdx].image_url }} style={s.svImg} resizeMode="cover" />
                    )}

                    {stories[svIdx]?.label && (
                        <View style={s.svLabelWrap}>
                            <Text style={s.svLabelTxt}>{stories[svIdx].label}</Text>
                        </View>
                    )}

                    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
                        <View style={{ flex: 1, flexDirection: 'row', marginTop: 140 }}>
                            <Pressable style={{ flex: 1 }} onPress={() => {
                                const prev = svIdx - 1
                                if (prev >= 0) { setSvIdx(prev); runStoryProgress(prev) }
                            }} />
                            <Pressable style={{ flex: 1 }} onPress={() => advanceStory(svIdx)} />
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ══════════════════════════════════
                STORY LABEL SHEET
            ══════════════════════════════════ */}
            <Modal visible={labelModal} animationType="slide" transparent onRequestClose={() => setLabelModal(false)}>
                <KeyboardAvoidingView style={s.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={s.sheet}>
                        <View style={s.sheetHandle} />
                        {pendingUri && (
                            <Image source={{ uri: pendingUri }} style={s.sheetPreview} resizeMode="cover" />
                        )}
                        <Text style={s.sheetTitle}>Add a label</Text>
                        <TextInput
                            style={s.sheetInput}
                            placeholder="e.g. OOTD, Haul, Drops…"
                            placeholderTextColor="#bbb"
                            value={storyLabel}
                            onChangeText={setStoryLabel}
                            maxLength={20}
                            autoFocus
                        />
                        <TouchableOpacity
                            style={[s.sheetPost, storyPosting && { opacity: 0.6 }]}
                            onPress={submitStory}
                            disabled={storyPosting}>
                            {storyPosting
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={s.sheetPostTxt}>Share Story</Text>
                            }
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setLabelModal(false)} style={s.sheetCancel}>
                            <Text style={s.sheetCancelTxt}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ══════════════════════════════════
                EDIT PROFILE
            ══════════════════════════════════ */}
            <Modal visible={editVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditVisible(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={s.editRoot}>
                        <View style={s.editHdr}>
                            <TouchableOpacity onPress={() => setEditVisible(false)}>
                                <Text style={s.editCancel}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={s.editTitle}>Edit Profile</Text>
                            <TouchableOpacity onPress={saveProfile} disabled={editSaving}>
                                {editSaving
                                    ? <ActivityIndicator size="small" color={ROSE} />
                                    : <Text style={s.editDone}>Done</Text>}
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
                            <View style={{ alignItems: 'center', marginBottom: 4 }}>
                                <TouchableOpacity onPress={pickEditAvatar} style={s.editAvWrap}>
                                    <Image source={{ uri: editAvatarUri || avatarSrc }} style={s.editAv} />
                                    <View style={s.editAvBadge}>
                                        <Ionicons name="camera" size={13} color="#fff" />
                                    </View>
                                </TouchableOpacity>
                                <Text style={s.editAvHint}>Change photo</Text>
                            </View>

                            {[
                                { label: 'Name',     val: editName,     set: setEditName,     ph: 'Your full name',  lower: false },
                                { label: 'Username', val: editUsername, set: setEditUsername, ph: '@handle',         lower: true  },
                            ].map(f => (
                                <View key={f.label}>
                                    <Text style={s.fLabel}>{f.label}</Text>
                                    <TextInput
                                        style={s.fInput}
                                        value={f.val}
                                        onChangeText={f.set}
                                        placeholder={f.ph}
                                        placeholderTextColor="#ccc"
                                        autoCapitalize={f.lower ? 'none' : 'words'}
                                    />
                                    <View style={s.fLine} />
                                </View>
                            ))}

                            <View>
                                <Text style={s.fLabel}>Bio</Text>
                                <TextInput
                                    style={[s.fInput, { minHeight: 60, textAlignVertical: 'top' }]}
                                    value={editBio}
                                    onChangeText={setEditBio}
                                    placeholder="Write something about yourself…"
                                    placeholderTextColor="#ccc"
                                    multiline maxLength={150}
                                />
                                <View style={s.fLine} />
                                <Text style={s.fCount}>{editBio.length}/150</Text>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ══════════════════════════════════
                FOLLOW MODAL
            ══════════════════════════════════ */}
            <Modal visible={fmVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFmVisible(false)}>
                <View style={s.fmRoot}>
                    <View style={s.fmHdr}>
                        <Text style={s.fmTitle}>{fmType === 'followers' ? 'Followers' : 'Following'}</Text>
                        <TouchableOpacity onPress={() => setFmVisible(false)}>
                            <Ionicons name="close" size={22} color="#555" />
                        </TouchableOpacity>
                    </View>
                    {fmLoading
                        ? <ActivityIndicator color={ROSE} style={{ marginTop: 40 }} />
                        : fmList.length === 0
                            ? <Text style={s.fmEmpty}>No {fmType} yet.</Text>
                            : (
                                <FlatList
                                    data={fmList}
                                    keyExtractor={u => u.id}
                                    ItemSeparatorComponent={() => <View style={s.fmSep} />}
                                    renderItem={({ item: u }) => {
                                        const isMe = u.id === currentUser?.id
                                        return (
                                            <View style={s.fmRow}>
                                                {/* Tappable avatar + name → go to their profile */}
                                                <TouchableOpacity
                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                                                    onPress={() => {
                                                        setFmVisible(false)
                                                        router.push(`/profile/${u.id}` as any)
                                                    }}>
                                                    <Image source={{ uri: av(u.display_name || u.username, u.avatar_url) }} style={s.fmAv} />
                                                    <View>
                                                        <Text style={s.fmName}>{u.display_name || u.username}</Text>
                                                        <Text style={s.fmUser}>@{u.username}</Text>
                                                    </View>
                                                </TouchableOpacity>
                                                {/* Follow / Following button — hidden for own account */}
                                                {!isMe && (
                                                    <TouchableOpacity
                                                        style={u.isFollowing ? s.fmFollowingBtn : s.fmFollowBtn}
                                                        onPress={() => toggleFollowUser(u.id, !!u.isFollowing)}>
                                                        <Text style={u.isFollowing ? s.fmFollowingTxt : s.fmFollowTxt}>
                                                            {u.isFollowing ? 'Following' : 'Follow'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        )
                                    }}
                                />
                            )
                    }
                </View>
            </Modal>
        </View>
    )
}

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
    root:    { flex: 1, backgroundColor: '#fff' },
    centered:{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

    // Header
    header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10, backgroundColor: '#fff' },
    hTitle:  { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#1a1a1a', letterSpacing: 0.2 },
    hBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

    // Profile row — avatar left, stats right (Instagram)
    profileRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
    avatarRing:   { width: 86, height: 86, borderRadius: 43, borderWidth: 1.5, borderColor: '#dbdbdb', padding: 2 },
    avatarRingLit:{ borderWidth: 2.5, borderColor: ROSE, padding: 2 },
    avatarRingViewed: { borderWidth: 2, borderColor: '#c7c7c7', padding: 2 },
    avatar:       { width: 78, height: 78, borderRadius: 39, borderWidth: 2, borderColor: '#fff' },
    statsRow:     { flex: 1, flexDirection: 'row', justifyContent: 'space-around', paddingLeft: 8 },
    stat:         { alignItems: 'center' },
    statNum:      { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
    statLbl:      { fontSize: 12, color: '#555', marginTop: 1 },

    // Bio
    bioWrap:      { paddingHorizontal: 16, paddingBottom: 14 },
    bioName:      { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
    bioText:      { fontSize: 13.5, color: '#333', lineHeight: 19, marginBottom: 10 },
    profileBtns:  { flexDirection: 'row', gap: 8 },
    profileBtn:   { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#f2f2f2', alignItems: 'center' },
    profileBtnTxt:{ fontSize: 13.5, fontWeight: '600', color: '#1a1a1a' },

    // Stories
    storiesStrip:   { borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    storiesContent: { paddingHorizontal: 12, paddingVertical: 12, gap: 12 },
    storyBubble:    { alignItems: 'center', width: 66 },
    storyLbl:       { fontSize: 10.5, color: '#333', marginTop: 5, textAlign: 'center', width: 64 },
    storyAddWrap:   { width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, borderColor: '#dbdbdb' },
    storyAddImg:    { width: 55, height: 55, borderRadius: 27.5 },
    storyPlusIcon:  { position: 'absolute', bottom: -1, right: -1, width: 20, height: 20, borderRadius: 10, backgroundColor: '#3897f0', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
    storyRing:      { width: 58, height: 58, borderRadius: 29, borderWidth: 2.5, borderColor: ROSE, padding: 2 },
    storyRingViewed:{ borderColor: '#c7c7c7', borderWidth: 2 },
    storyImg:       { width: 49, height: 49, borderRadius: 24.5 },

    // Tabs
    tabBar: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#ececec', backgroundColor: '#fff' },
    tab:    { flex: 1, alignItems: 'center', paddingVertical: 10 },
    tabActive: { borderTopWidth: 1, borderTopColor: '#1a1a1a', marginTop: -0.5 },

    // Grid
    grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 1.5 },
    gridCell: { width: GRID_CELL, height: GRID_CELL, backgroundColor: '#f5f0f2' },

    // Empty
    empty:      { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 10 },
    emptyCircle:{ width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyH:     { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
    emptyP:     { fontSize: 13.5, color: '#999', textAlign: 'center', lineHeight: 19 },
    emptyLink:  { fontSize: 14, fontWeight: '700', color: '#3897f0', marginTop: 8 },

    // Bottom nav
    nav:       { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 0.5, borderTopColor: '#ececec', paddingBottom: 28, paddingTop: 10 },
    navItem:   { flex: 1, alignItems: 'center', gap: 3 },
    navTxt:    { fontSize: 10, color: '#aaa', fontWeight: '600' },
    navIconWrap:{ position: 'relative' },
    badge:     { position: 'absolute', top: -3, right: -6, backgroundColor: ROSE, minWidth: 15, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: '#fff' },
    badgeTxt:  { color: '#fff', fontSize: 8, fontWeight: '800' },

    // Lightbox
    lbRoot:    { flex: 1, backgroundColor: '#fff' },
    lbHdr:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 54, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    lbHdrAv:   { width: 34, height: 34, borderRadius: 17 },
    lbHdrName: { fontSize: 13.5, fontWeight: '700', color: '#1a1a1a' },
    lbHdrSub:  { fontSize: 11, color: '#aaa' },
    lbNavBtn:  { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#eee', alignItems: 'center', justifyContent: 'center' },
    lbImg:     { width: SCREEN_W, height: SCREEN_W, backgroundColor: '#f5f0f2' },
    lbBody:    { padding: 16 },
    lbTitleRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    lbName:    { fontSize: 17, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 10 },
    lbPts:     { fontSize: 15, fontWeight: '800', color: GREEN },
    pill:      { backgroundColor: '#faf4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
    pillLbl:   { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: ROSE },
    pillVal:   { fontSize: 12.5, fontWeight: '700', color: '#1a1a1a', marginTop: 1 },
    tagsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    tagChip:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50, backgroundColor: '#f5f5f5' },
    tagChipTxt:{ fontSize: 12, color: '#888' },
    lbDesc:    { fontSize: 13.5, color: '#444', lineHeight: 20, marginBottom: 14 },
    lbActions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    lbEditBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#edf3f2', borderRadius: 10 },
    lbEditTxt: { fontSize: 13, fontWeight: '700', color: GREEN },
    lbDelBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderWidth: 1, borderColor: '#fdd', borderRadius: 10 },
    lbDelTxt:  { fontSize: 13, fontWeight: '700', color: '#e74c3c' },
    divider:   { height: 0.5, backgroundColor: '#ececec', marginBottom: 16 },
    cmtHeading:{ fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
    cmtEmpty:  { fontSize: 13, color: '#ccc', textAlign: 'center', paddingVertical: 20 },
    cmtRow:    { flexDirection: 'row', gap: 10, marginBottom: 14 },
    cmtAv:     { width: 30, height: 30, borderRadius: 15 },
    cmtBody:   { fontSize: 13.5, color: '#333', lineHeight: 20, flex: 1 },
    cmtUsr:    { fontWeight: '700' },
    cmtTime:   { fontSize: 11, color: '#aaa', marginTop: 2 },
    cmtBar:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 30, borderTopWidth: 0.5, borderTopColor: '#ececec', backgroundColor: '#fff' },
    cmtBarAv:  { width: 30, height: 30, borderRadius: 15 },
    cmtInput:  { flex: 1, fontSize: 13.5, color: '#333', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#f8f8f8', borderRadius: 24 },
    cmtPost:   { fontSize: 14, fontWeight: '700', color: '#3897f0' },

    // Story viewer
    svRoot:        { flex: 1, backgroundColor: '#000' },
    svProgressRow: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingTop: 58 },
    svTrack:       { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1 },
    svFill:        { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
    svHdr:         { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 72, paddingBottom: 10 },
    svHdrAv:       { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
    svHdrName:     { fontSize: 14, fontWeight: '700', color: '#fff' },
    svHdrTime:     { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
    svImg:         { width: '100%', height: '100%' },
    svLabelWrap:   { position: 'absolute', bottom: 80, left: 0, right: 0, alignItems: 'center' },
    svLabelTxt:    { color: '#fff', fontSize: 15, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 50, overflow: 'hidden' },

    // Story label sheet
    sheetOverlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet:         { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 24, paddingBottom: 44 },
    sheetHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 18 },
    sheetPreview:  { width: '100%', height: 180, borderRadius: 14, marginBottom: 16, backgroundColor: '#f0eaec' },
    sheetTitle:    { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
    sheetInput:    { borderWidth: 1.5, borderColor: '#ececec', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#333', marginBottom: 16 },
    sheetPost:     { backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
    sheetPostTxt:  { color: '#fff', fontWeight: '700', fontSize: 15 },
    sheetCancel:   { alignItems: 'center', paddingVertical: 8 },
    sheetCancelTxt:{ fontSize: 14, color: '#aaa', fontWeight: '600' },

    // Edit profile
    editRoot:    { flex: 1, backgroundColor: '#fff' },
    editHdr:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    editTitle:   { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
    editCancel:  { fontSize: 15, color: '#555' },
    editDone:    { fontSize: 15, fontWeight: '700', color: '#3897f0' },
    editAvWrap:  { width: 86, height: 86, borderRadius: 43 },
    editAv:      { width: 86, height: 86, borderRadius: 43 },
    editAvBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#aaa', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff' },
    editAvHint:  { fontSize: 12, color: '#3897f0', fontWeight: '600', marginTop: 8 },
    fLabel:      { fontSize: 12, color: '#aaa', fontWeight: '600', marginBottom: 4 },
    fInput:      { fontSize: 15, color: '#1a1a1a', paddingVertical: 8 },
    fLine:       { height: 0.5, backgroundColor: '#ececec' },
    fCount:      { fontSize: 11, color: '#bbb', textAlign: 'right', marginTop: 4 },

    // Follow modal — Instagram style
    fmRoot:         { flex: 1, backgroundColor: '#fff' },
    fmHdr:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    fmTitle:        { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
    fmEmpty:        { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
    fmRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    fmAv:           { width: 44, height: 44, borderRadius: 22 },
    fmName:         { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
    fmUser:         { fontSize: 12, color: '#aaa', marginTop: 1 },
    fmFollowBtn:    { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, backgroundColor: '#3897f0', alignItems: 'center', justifyContent: 'center', minWidth: 90 },
    fmFollowingBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center', minWidth: 90, borderWidth: 0.5, borderColor: '#dbdbdb' },
    fmFollowTxt:    { fontSize: 13.5, fontWeight: '700', color: '#fff' },
    fmFollowingTxt: { fontSize: 13.5, fontWeight: '700', color: '#1a1a1a' },
    fmSep:          { height: 0.5, backgroundColor: '#f5f5f5', marginLeft: 72 },
})