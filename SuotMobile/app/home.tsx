import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useUnreadCount } from '../hooks/useUnreadCount'
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, FlatList, ActivityIndicator, Modal, TextInput,
    Dimensions, Animated, KeyboardAvoidingView, Platform,
    Alert, Pressable, StatusBar, RefreshControl
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
const ROSE  = '#C994A7'
const GREEN = '#4A635D'
const BLUSH = '#EBE0E3'
const DARK  = '#1a1a1a'
const W     = Dimensions.get('window').width

// ─────────────────────────────────────────────
//  ICON WRAPPERS  (all Ionicons — no SVG dep)
// ─────────────────────────────────────────────
const IconHeart = ({ filled, color = DARK, size = 24 }: { filled?: boolean; color?: string; size?: number }) => (
    <Ionicons name={filled ? 'heart' : 'heart-outline'} size={size} color={color} />
)
const IconComment = ({ size = 24, color = DARK }: { size?: number; color?: string }) => (
    <Ionicons name="chatbubble-outline" size={size} color={color} />
)
const IconSend = ({ size = 24, color = DARK }: { size?: number; color?: string }) => (
    <Ionicons name="paper-plane-outline" size={size} color={color} />
)
const IconBookmark = ({ filled, size = 24, color = DARK }: { filled?: boolean; size?: number; color?: string }) => (
    <Ionicons name={filled ? 'bookmark' : 'bookmark-outline'} size={size} color={color} />
)
const IconMore = ({ size = 20, color = '#aaa' }: { size?: number; color?: string }) => (
    <Ionicons name="ellipsis-horizontal" size={size} color={color} />
)
const IconImage = ({ size = 22, color = '#aaa' }: { size?: number; color?: string }) => (
    <Ionicons name="image-outline" size={size} color={color} />
)
const IconTag = ({ size = 22, color = GREEN }: { size?: number; color?: string }) => (
    <Ionicons name="pricetag-outline" size={size} color={color} />
)
const IconAdd = ({ size = 12, color = '#fff' }: { size?: number; color?: string }) => (
    <Ionicons name="add" size={size} color={color} />
)
const IconClose = ({ size = 22, color = '#555' }: { size?: number; color?: string }) => (
    <Ionicons name="close" size={size} color={color} />
)

// Reaction icons — Ionicons only, no JSX.Element type (use React.ReactElement)
type ReactionRenderer = (active: boolean) => React.ReactElement
const REACTION_SVGS: Record<string, ReactionRenderer> = {
    heart:       (a) => <Ionicons name={a ? 'heart'        : 'heart-outline'}    size={26} color={a ? '#e05577' : '#888'} />,
    fire:        (a) => <Ionicons name={a ? 'flame'        : 'flame-outline'}    size={26} color={a ? '#f97316' : '#888'} />,
    love:        (a) => <Ionicons name={a ? 'happy'        : 'happy-outline'}    size={26} color={a ? '#f59e0b' : '#888'} />,
    green_heart: (a) => <Ionicons name={a ? 'heart-circle' : 'heart-circle-outline'} size={26} color={a ? '#22c55e' : '#888'} />,
}
const REACTION_LABELS: Record<string, string> = {
    heart: 'Love', fire: 'Fire', love: 'Haha', green_heart: 'Support'
}

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────
type UserProfile = {
    id: string; username: string; display_name: string
    avatar_url: string | null; pts: number
}
type Story = {
    id: string; image_url: string; label: string; created_at: string
    owner: { id: string; name: string; av: string }
    viewed: boolean
}
type Post = {
    id: string; user_id: string; caption: string
    images: string[]; hashtags: string[]; linked_item_id: string | null
    created_at: string; comments_count: number
    profiles: { id: string; display_name: string; username: string; avatar_url: string | null }
    myReaction?: string | null
    reactionCounts?: Record<string, number>
    saved?: boolean
    linkedItemData?: { id: string; name: string; pts: number; images: string[]; category: string } | null
}
type Comment = {
    id: string; text: string; created_at: string; user_id: string
    parent_comment_id: string | null
    profiles: { id: string; display_name: string; username: string; avatar_url: string | null }
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
function avUrl(name: string, url: string | null) {
    return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=EBE0E3&color=C994A7&size=200`
}
function heroGreeting() {
    const h = new Date().getHours()
    if (h >= 5  && h < 12) return 'Good morning'
    if (h >= 12 && h < 17) return 'Good afternoon'
    return 'Good evening'
}
function seasonalInfo() {
    const m = new Date().getMonth() + 1
    if (m >= 3  && m <= 5)  return { label: 'Summer Spotlight',     title: 'Hot Season, Cool Swaps!',       sub: 'Swap your breezy fits and find your next summer look.' }
    if (m >= 6  && m <= 9)  return { label: 'Rainy Season Picks',   title: 'Swap for the Storm!',            sub: 'Find cozy knits, hoodies and rain-ready looks.' }
    if (m >= 10 && m <= 12) return { label: '\u2011Ber Season Vibes', title: "\u2019Ber Season Style Swap!", sub: 'Share holiday fits and find festive new pieces.' }
    return { label: 'New Year Fresh Looks', title: 'New Year, New Wardrobe!', sub: 'Swap out the old and discover new styles.' }
}

// ─────────────────────────────────────────────
//  STORY PROGRESS BAR
// ─────────────────────────────────────────────
function StoryBars({ total, current, progress }: { total: number; current: number; progress: Animated.Value }) {
    return (
        <View style={sv.bars}>
            {Array.from({ length: total }).map((_, i) => (
                <View key={i} style={sv.track}>
                    <Animated.View style={[sv.fill, {
                        width: i < current ? '100%'
                            : i === current
                                ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                                : '0%'
                    }]} />
                </View>
            ))}
        </View>
    )
}

// ─────────────────────────────────────────────
//  STORY RING — Instagram-style gradient ring with white gap
//  Unviewed = rose/pink ring  |  Viewed = grey ring
// ─────────────────────────────────────────────
function StoryRing({ viewed, children }: { viewed: boolean; children: React.ReactNode }) {
    return (
        <View style={[storyRingS.outerBorder, viewed ? storyRingS.borderViewed : storyRingS.borderUnviewed]}>
            {/* White gap between ring and avatar */}
            <View style={storyRingS.whiteGap}>
                <View style={storyRingS.imgWrap}>
                    {children}
                </View>
            </View>
        </View>
    )
}
const storyRingS = StyleSheet.create({
    outerBorder:     { width: 68, height: 68, borderRadius: 34, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
    borderUnviewed:  { borderWidth: 2.5, borderColor: ROSE },
    borderViewed:    { borderWidth: 2, borderColor: '#c7c7c7' },
    whiteGap:        { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', padding: 2, alignItems: 'center', justifyContent: 'center' },
    imgWrap:         { width: 56, height: 56, borderRadius: 28, overflow: 'hidden' },
})

// ─────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────
export default function HomeScreen() {
    const router      = useRouter()
    const unreadCount = useUnreadCount()

    const [me,          setMe]          = useState<UserProfile | null>(null)
    const [stories,     setStories]     = useState<Story[]>([])
    const [posts,       setPosts]       = useState<Post[]>([])
    const [loading,     setLoading]     = useState(true)
    const [refreshing,  setRefreshing]  = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [page,        setPage]        = useState(0)
    const [done,        setDone]        = useState(false)
    const [activeTag,   setActiveTag]   = useState('all')

    // Story viewer
    const [svVisible, setSvVisible] = useState(false)
    const [svIdx,     setSvIdx]     = useState(0)
    const svProg = useRef(new Animated.Value(0)).current
    const svAnim = useRef<Animated.CompositeAnimation | null>(null)

    // Story reply (non-owner)
    const [svReplyText,    setSvReplyText]    = useState('')
    const [svReplySending, setSvReplySending] = useState(false)

    // Story viewers (owner sees who viewed)
    const [svViewers,        setSvViewers]        = useState<any[]>([])
    const [svViewersLoading, setSvViewersLoading] = useState(false)

    // Compose
    const [composeVisible, setComposeVisible] = useState(false)
    const [composeText,    setComposeText]    = useState('')
    const [composeImgUri,  setComposeImgUri]  = useState<string | null>(null)
    const [composing,      setComposing]      = useState(false)

    // Item picker (for Link Item in compose)
    const [itemPickerVisible, setItemPickerVisible] = useState(false)
    const [myItems,           setMyItems]           = useState<any[]>([])
    const [itemsLoading,      setItemsLoading]      = useState(false)
    const [linkedItem,        setLinkedItem]        = useState<any | null>(null)

    // Comments
    const [cmtPostId,  setCmtPostId]  = useState<string | null>(null)
    const [cmtVisible, setCmtVisible] = useState(false)
    const [comments,   setComments]   = useState<Comment[]>([])
    const [cmtLoading, setCmtLoading] = useState(false)
    const [cmtText,    setCmtText]    = useState('')
    const [cmtPosting, setCmtPosting] = useState(false)

    // Reaction picker
    const [reactPostId, setReactPostId] = useState<string | null>(null)

    // Notifications
    const [notifVisible,  setNotifVisible]  = useState(false)
    const [notifs,        setNotifs]        = useState<any[]>([])
    const [notifsLoading, setNotifsLoading] = useState(false)
    const [unreadNotifs,  setUnreadNotifs]  = useState(0)

    // ── Boot ─────────────────────────────────────
    useEffect(() => { boot() }, [])

    async function boot() {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.replace('/login' as any); return }
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        setMe(prof)
        await Promise.all([loadStories(session.user.id, prof), loadPosts(0, true), loadUnreadNotifCount(session.user.id)])
        setLoading(false)
    }

    async function loadUnreadNotifCount(userId: string) {
        const { count } = await supabase.from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId).eq('read', false)
        setUnreadNotifs(count || 0)
    }

    async function openNotifications() {
        setNotifVisible(true)
        setNotifsLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase.from('notifications')
            .select('*').eq('user_id', session.user.id)
            .order('created_at', { ascending: false }).limit(40)
        setNotifs(data || [])
        setNotifsLoading(false)
        // mark all read
        await supabase.from('notifications').update({ read: true })
            .eq('user_id', session.user.id).eq('read', false)
        setUnreadNotifs(0)
    }

    // ── Item picker ───────────────────────────────
    async function openItemPicker() {
        setItemPickerVisible(true)
        setItemsLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase.from('items')
            .select('id, name, pts, images, category')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false }).limit(30)
        setMyItems(data || [])
        setItemsLoading(false)
    }

    // ── Story viewer reply (non-owner) ────────────
    async function sendStoryReply() {
        if (!svReplyText.trim() || !stories[svIdx]) return
        const story = stories[svIdx]
        setSvReplySending(true)
        await supabase.from('messages').insert({
            from_user_id: me?.id,
            to_user_id:   story.owner.id,
            body:         `Replied to your story "${story.label || 'story'}": ${svReplyText.trim()}`
        })
        setSvReplyText('')
        setSvReplySending(false)
    }

    // ── Story viewers (owner) ─────────────────────
    async function loadStoryViewers(storyId: string) {
        setSvViewersLoading(true)
        const { data } = await supabase.from('story_views')
            .select('*, profiles(id, display_name, username, avatar_url)')
            .eq('story_id', storyId)
            .order('viewed_at', { ascending: false })
        setSvViewers(data || [])
        setSvViewersLoading(false)
    }

    // ── Stories ───────────────────────────────────
    async function loadStories(userId: string, prof: UserProfile) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const { data: own } = await supabase.from('stories').select('*')
            .eq('user_id', userId).gt('created_at', cutoff).order('created_at', { ascending: false })

        const { data: followRows } = await supabase.from('follows')
            .select('following_id').eq('follower_id', userId)
        const followIds = (followRows || []).map((r: any) => r.following_id)

        // fetch which story IDs the current user has already viewed
        const { data: viewedRows } = await supabase.from('story_views')
            .select('story_id').eq('viewer_id', userId)
        const viewedSet = new Set((viewedRows || []).map((r: any) => r.story_id))

        let friendStories: any[] = []
        if (followIds.length) {
            const { data: fs } = await supabase.from('stories')
                .select('*, profiles(id, username, display_name, avatar_url)')
                .in('user_id', followIds).gt('created_at', cutoff)
                .order('created_at', { ascending: false })
            friendStories = fs || []
        }

        const name = prof?.display_name || prof?.username || 'You'
        const myAv = avUrl(name, prof?.avatar_url)
        const all: Story[] = []

        ;(own || []).forEach((s: any) => all.push({
            id: s.id, image_url: s.image_url, label: s.label || '',
            created_at: s.created_at, viewed: viewedSet.has(s.id),
            owner: { id: userId, name, av: myAv }
        }))
        friendStories.forEach((s: any) => {
            const p = s.profiles || {}
            const n = p.display_name || p.username || 'User'
            all.push({
                id: s.id, image_url: s.image_url, label: s.label || '',
                created_at: s.created_at, viewed: viewedSet.has(s.id),
                owner: { id: p.id, name: n, av: avUrl(n, p.avatar_url) }
            })
        })
        setStories(all)
    }

    // ── Posts ─────────────────────────────────────
    async function loadPosts(pageNum: number, reset: boolean) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data: followRows } = await supabase.from('follows').select('following_id').eq('follower_id', session.user.id)
        const followIds = [session.user.id, ...(followRows || []).map((r: any) => r.following_id)]
        const { data: raw } = await supabase.from('posts')
            .select('*, profiles(id, display_name, username, avatar_url)')
            .in('user_id', followIds).order('created_at', { ascending: false })
            .range(pageNum * 15, pageNum * 15 + 14)
        const fetched = (raw || []) as Post[]
        if (fetched.length < 15) setDone(true)
        const ids = fetched.map(p => p.id)
        const [{ data: myRx }, { data: allRx }, { data: savedRows }] = await Promise.all([
            supabase.from('post_reactions').select('post_id, reaction_type').eq('user_id', session.user.id).in('post_id', ids),
            supabase.from('post_reactions').select('post_id, reaction_type').in('post_id', ids),
            supabase.from('post_saves').select('post_id').eq('user_id', session.user.id).in('post_id', ids),
        ])
        const rxMap: Record<string, string> = {}
        ;(myRx || []).forEach((r: any) => { rxMap[r.post_id] = r.reaction_type })
        const countMap: Record<string, Record<string, number>> = {}
        ;(allRx || []).forEach((r: any) => {
            if (!countMap[r.post_id]) countMap[r.post_id] = {}
            countMap[r.post_id][r.reaction_type] = (countMap[r.post_id][r.reaction_type] || 0) + 1
        })
        const savedSet = new Set((savedRows || []).map((r: any) => r.post_id))

        // Fetch linked item data for any posts that have one
        const linkedIds = fetched.map(p => p.linked_item_id).filter(Boolean) as string[]
        const linkedItemMap: Record<string, any> = {}
        if (linkedIds.length) {
            const { data: linkedItems } = await supabase
                .from('items').select('id, name, pts, images, category').in('id', linkedIds)
            ;(linkedItems || []).forEach((item: any) => { linkedItemMap[item.id] = item })
        }

        const enriched = fetched.map(p => ({
            ...p,
            myReaction:     rxMap[p.id] || null,
            reactionCounts: countMap[p.id] || {},
            saved:          savedSet.has(p.id),
            linkedItemData: p.linked_item_id ? linkedItemMap[p.linked_item_id] || null : null
        }))
        if (reset) setPosts(enriched); else setPosts(prev => [...prev, ...enriched])
        setPage(pageNum)
    }

    const onRefresh = useCallback(async () => {
        setRefreshing(true); setDone(false)
        await loadPosts(0, true); setRefreshing(false)
    }, [])

    async function loadMore() {
        if (loadingMore || done) return
        setLoadingMore(true); await loadPosts(page + 1, false); setLoadingMore(false)
    }

    // ── Story viewer ──────────────────────────────
    function openStory(idx: number) {
        const story = stories[idx]
        setSvIdx(idx); setSvVisible(true); runSvProg(idx)
        setSvReplyText('')
        // Mark ALL stories from this owner as viewed so the ring goes grey immediately
        if (story) {
            setStories(prev => prev.map(s =>
                s.owner.id === story.owner.id ? { ...s, viewed: true } : s
            ))
            if (story.owner.id !== me?.id) {
                supabase.from('story_views')
                    .upsert({ story_id: story.id, viewer_id: me?.id }, { onConflict: 'story_id,viewer_id' })
                    .then(() => {})
            } else {
                // owner: load viewers
                loadStoryViewers(story.id)
            }
        }
    }

    function runSvProg(idx: number) {
        svProg.setValue(0); svAnim.current?.stop()
        svAnim.current = Animated.timing(svProg, { toValue: 1, duration: 5000, useNativeDriver: false })
        svAnim.current.start(({ finished }) => { if (finished) advanceSv(idx) })
    }

    function advanceSv(idx: number) {
        const next = idx + 1
        if (next < stories.length) {
            setSvIdx(next)
            const nextStory = stories[next]
            if (nextStory) {
                setStories(prev => prev.map(s =>
                    s.owner.id === nextStory.owner.id ? { ...s, viewed: true } : s
                ))
                if (nextStory.owner.id !== me?.id) {
                    supabase.from('story_views')
                        .upsert({ story_id: nextStory.id, viewer_id: me?.id }, { onConflict: 'story_id,viewer_id' })
                        .then(() => {})
                }
            }
            runSvProg(next)
        } else {
            setSvVisible(false)
        }
    }

    // ── Compose ───────────────────────────────────
    async function pickComposeImage() {
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 })
        if (!r.canceled) setComposeImgUri(r.assets[0].uri)
    }

    async function submitPost() {
        if (!composeText.trim() && !composeImgUri && !linkedItem) return
        if (!me) return
        setComposing(true)
        try {
            const insertData: any = {
                user_id: me.id, caption: composeText.trim(),
                images: [], hashtags: [],
                linked_item_id: linkedItem?.id || null
            }
            if (composeImgUri) {
                const ext  = composeImgUri.split('.').pop() || 'jpg'
                const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
                const path = `posts/${me.id}/${Date.now()}.${ext}`
                const fd   = new FormData()
                fd.append('file', { uri: composeImgUri, name: `post.${ext}`, type: mime } as any)
                const { error: upErr } = await supabase.storage.from('post-images').upload(path, fd as any, { contentType: mime, upsert: true })
                if (!upErr) {
                    const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path)
                    insertData.images = [publicUrl]
                }
            }
            insertData.hashtags = (composeText.match(/#([a-zA-Z0-9_]+)/g) || []).map((t: string) => t.slice(1))
            const { data: saved } = await supabase.from('posts')
                .insert(insertData).select('*, profiles(id, display_name, username, avatar_url)').single()
            if (saved) setPosts(prev => [{
                ...saved,
                myReaction: null, reactionCounts: {}, saved: false,
                linkedItemData: linkedItem || null
            }, ...prev])
            setComposeText(''); setComposeImgUri(null); setLinkedItem(null); setComposeVisible(false)
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not post.')
        }
        setComposing(false)
    }

    // ── Reactions — one per user, spam-proof ──────
    const reactingRef = useRef<Set<string>>(new Set())

    async function handleReaction(postId: string, type: string) {
        // Prevent spam: if already processing this post's reaction, ignore
        if (reactingRef.current.has(postId)) return
        reactingRef.current.add(postId)
        setReactPostId(null)

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { reactingRef.current.delete(postId); return }

        const post    = posts.find(p => p.id === postId)
        const current = post?.myReaction

        // Optimistic update first so UI feels instant
        if (current === type) {
            // Toggle OFF
            setPosts(prev => prev.map(p => {
                if (p.id !== postId) return p
                const counts = { ...p.reactionCounts }
                counts[type] = Math.max(0, (counts[type] || 0) - 1)
                return { ...p, myReaction: null, reactionCounts: counts }
            }))
            await supabase.from('post_reactions')
                .delete().eq('post_id', postId).eq('user_id', session.user.id)
        } else {
            // Switch reaction or add new — always one row per user per post
            setPosts(prev => prev.map(p => {
                if (p.id !== postId) return p
                const counts = { ...p.reactionCounts }
                if (current) counts[current] = Math.max(0, (counts[current] || 0) - 1)
                counts[type] = (counts[type] || 0) + 1
                return { ...p, myReaction: type, reactionCounts: counts }
            }))
            // upsert ensures only one row per user+post in DB
            await supabase.from('post_reactions').upsert(
                { post_id: postId, user_id: session.user.id, reaction_type: type },
                { onConflict: 'post_id,user_id' }
            )
        }

        reactingRef.current.delete(postId)
    }

    // ── Save post ─────────────────────────────────
    async function toggleSave(postId: string, currentlySaved: boolean) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        if (currentlySaved) {
            await supabase.from('post_saves').delete().eq('post_id', postId).eq('user_id', session.user.id)
        } else {
            await supabase.from('post_saves').insert({ post_id: postId, user_id: session.user.id })
        }
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, saved: !currentlySaved } : p))
    }

    // ── Comments ──────────────────────────────────
    async function openComments(postId: string) {
        setCmtPostId(postId); setCmtVisible(true); setCmtLoading(true)
        const { data } = await supabase.from('post_comments')
            .select('*, profiles(id, display_name, username, avatar_url)')
            .eq('post_id', postId).is('parent_comment_id', null)
            .order('created_at', { ascending: true })
        setComments(data || []); setCmtLoading(false)
    }

    async function postComment() {
        if (!cmtText.trim() || !cmtPostId || cmtPosting) return
        setCmtPosting(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setCmtPosting(false); return }
        const { data: saved } = await supabase.from('post_comments')
            .insert({ post_id: cmtPostId, user_id: session.user.id, text: cmtText.trim() })
            .select('*, profiles(id, display_name, username, avatar_url)').single()
        if (saved) {
            setComments(p => [...p, saved]); setCmtText('')
            setPosts(prev => prev.map(p => p.id === cmtPostId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p))
        }
        setCmtPosting(false)
    }

    async function deletePostAction(postId: string) {
        Alert.alert('Delete Post', 'This will permanently delete this post.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                await supabase.from('posts').delete().eq('id', postId)
                setPosts(p => p.filter(post => post.id !== postId))
            }}
        ])
    }

    // ─────────────────────────────────────────────
    //  DERIVED VALUES
    // ─────────────────────────────────────────────
    const dName    = me?.display_name || me?.username || 'Swapper'
    const myAv     = avUrl(dName, me?.avatar_url || null)
    const seasonal = seasonalInfo()
    const HASHTAGS = ['all', 'OOTD', 'swap', 'drops', 'hauls']
    const filteredPosts = activeTag === 'all' ? posts : posts.filter(p => p.hashtags?.includes(activeTag))

    // deduplicate stories by owner for the strip
    const storyGroups = (() => {
        const seen = new Set<string>()
        return stories.filter(s => { if (seen.has(s.owner.id)) return false; seen.add(s.owner.id); return true })
    })()

    // ─────────────────────────────────────────────
    //  POST CARD
    // ─────────────────────────────────────────────
    const PostCard = ({ post }: { post: Post }) => {
        const prof     = post.profiles || {} as any
        const pName    = prof.display_name || prof.username || 'Swapper'
        const pAv      = avUrl(pName, prof.avatar_url)
        const isOwn    = post.user_id === me?.id
        const totalRx  = Object.values(post.reactionCounts || {}).reduce((a: any, b: any) => a + b, 0) as number
        const myRx     = post.myReaction
        const rxLine   = totalRx > 0
            ? Object.entries(post.reactionCounts || {})
                .filter(([, c]) => (c as number) > 0)
                .map(([t, c]) => `${c} ${REACTION_LABELS[t] || t}`)
                .join(' · ')
            : ''

        return (
            <View style={pc.card}>

                {/* ── Header ── */}
                <View style={pc.header}>
                    <TouchableOpacity onPress={() => router.push(`/profile/${prof.id}` as any)}>
                        <Image source={{ uri: pAv }} style={pc.avatar} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={pc.author}>{pName}</Text>
                        <Text style={pc.time}>{timeAgo(post.created_at)}</Text>
                    </View>
                    {isOwn && (
                        <TouchableOpacity onPress={() => deletePostAction(post.id)} style={pc.moreBtn}>
                            <IconMore />
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Caption — above image (Facebook-style) ── */}
                {!!post.caption && (
                    <View style={pc.captionWrap}>
                        <Text style={pc.caption}>
                            {post.caption.split(/(#\w+)/g).map((part, i) =>
                                part.startsWith('#')
                                    ? <Text key={i} style={pc.captionTag}>{part}</Text>
                                    : part
                            )}
                        </Text>
                    </View>
                )}

                {/* ── Image ── */}
                {post.images?.length > 0 && (
                    <Image source={{ uri: post.images[0] }} style={pc.image} resizeMode="cover" />
                )}

                {/* ── Linked Item Card ── */}
                {post.linkedItemData && (
                    <TouchableOpacity
                        style={pc.linkedCard}
                        onPress={() => router.push(`/item/${post.linkedItemData!.id}` as any)}
                        activeOpacity={0.85}>
                        <Image
                            source={{ uri: post.linkedItemData.images?.[0] || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300' }}
                            style={pc.linkedImg}
                        />
                        <View style={pc.linkedInfo}>
                            <Text style={pc.linkedLabel}>Linked Item</Text>
                            <Text style={pc.linkedName} numberOfLines={2}>{post.linkedItemData.name}</Text>
                            <View style={pc.linkedMeta}>
                                <Text style={pc.linkedPts}>{(post.linkedItemData.pts || 0).toLocaleString()} pts</Text>
                                <View style={pc.linkedCatPill}>
                                    <Text style={pc.linkedCat}>{post.linkedItemData.category}</Text>
                                </View>
                            </View>
                        </View>
                        <View style={pc.linkedSwapBtn}>
                            <Ionicons name="swap-horizontal" size={14} color="#fff" />
                            <Text style={pc.linkedSwapTxt}>Swap</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* ── ACTION BAR ── */}
                <View style={pc.actions}>
                    <View style={{ position: 'relative' }}>
                        <TouchableOpacity
                            style={pc.actionBtn}
                            onPress={() => handleReaction(post.id, 'heart')}
                            onLongPress={() => setReactPostId(reactPostId === post.id ? null : post.id)}>
                            <IconHeart filled={!!myRx} color={myRx === 'heart' ? '#e05577' : myRx ? GREEN : '#555'} size={24} />
                        </TouchableOpacity>
                        {reactPostId === post.id && (
                            <View style={pc.rxPicker}>
                                {Object.keys(REACTION_SVGS).map(type => (
                                    <TouchableOpacity
                                        key={type}
                                        style={[pc.rxPickerBtn, myRx === type && pc.rxPickerBtnActive]}
                                        onPress={() => handleReaction(post.id, type)}>
                                        {REACTION_SVGS[type](myRx === type)}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                    <TouchableOpacity style={pc.actionBtn} onPress={() => openComments(post.id)}>
                        <IconComment size={24} color="#555" />
                    </TouchableOpacity>
                    <TouchableOpacity style={pc.actionBtn}>
                        <IconSend size={22} color="#555" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity style={pc.actionBtn} onPress={() => toggleSave(post.id, !!post.saved)}>
                        <IconBookmark filled={!!post.saved} size={24} color={post.saved ? GREEN : '#555'} />
                    </TouchableOpacity>
                </View>

                {/* ── Reaction count + comment count ── */}
                {(!!rxLine || (post.comments_count || 0) > 0) && (
                    <View style={pc.countsRow}>
                        {!!rxLine && <Text style={pc.rxLine}>{rxLine}</Text>}
                        {(post.comments_count || 0) > 0 && (
                            <TouchableOpacity onPress={() => openComments(post.id)}>
                                <Text style={pc.viewCmt}>{post.comments_count} comment{post.comments_count !== 1 ? 's' : ''}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                <Text style={pc.postDate}>{timeAgo(post.created_at).toUpperCase()}</Text>
            </View>
        )
    }

    // ─────────────────────────────────────────────
    //  LOADING STATE
    // ─────────────────────────────────────────────
    if (loading && !me) return (
        <View style={s.centered}><ActivityIndicator color={ROSE} size="large" /></View>
    )

    // ─────────────────────────────────────────────
    //  MAIN RENDER
    // ─────────────────────────────────────────────
    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" />

            {/* ── TOP BAR ── */}
            <View style={s.topBar}>
                <Text style={s.topLogo}>Suot</Text>
                <TouchableOpacity onPress={openNotifications} style={s.topBtn}>
                    <Ionicons name="notifications-outline" size={26} color={DARK} />
                    {unreadNotifs > 0 && (
                        <View style={s.topBadge}><Text style={s.topBadgeTxt}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text></View>
                    )}
                </TouchableOpacity>
            </View>

            <FlatList
                data={filteredPosts}
                keyExtractor={p => p.id}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ROSE} />}
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
                ListFooterComponent={loadingMore
                    ? <ActivityIndicator color={ROSE} style={{ marginVertical: 20 }} />
                    : null
                }
                ListHeaderComponent={
                    <>
                        {/* ── STORIES STRIP ── */}
                        <View style={s.storiesWrap}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storiesRow}>

                                {/* Your story / add bubble */}
                                <TouchableOpacity style={s.storyBubble} onPress={() => setComposeVisible(true)}>
                                    <View style={s.storyAddOuter}>
                                        <Image source={{ uri: myAv }} style={s.storyAddImg} />
                                        <View style={s.storyAddPlus}><IconAdd size={12} /></View>
                                    </View>
                                    <Text style={s.storyLbl} numberOfLines={1}>Your story</Text>
                                </TouchableOpacity>

                                {/* Friend stories — ring changes on view */}
                                {storyGroups.map(story => {
                                    const firstIdx = stories.findIndex(s => s.owner.id === story.owner.id)
                                    return (
                                        <TouchableOpacity key={story.owner.id} style={s.storyBubble} onPress={() => openStory(firstIdx)}>
                                            <StoryRing viewed={story.viewed}>
                                                <Image source={{ uri: story.owner.av }} style={s.storyAv} />
                                            </StoryRing>
                                            <Text style={s.storyLbl} numberOfLines={1}>{story.owner.name.split(' ')[0]}</Text>
                                        </TouchableOpacity>
                                    )
                                })}
                            </ScrollView>
                        </View>

                        <View style={s.hairline} />

                        {/* ── HERO BANNER ── */}
                        <View style={s.hero}>
                            <View style={{ flex: 1, zIndex: 1 }}>
                                <Text style={s.heroGreet}>{heroGreeting()}</Text>
                                <Text style={s.heroName}>
                                    Welcome back, <Text style={s.heroNameEm}>{dName}</Text>!
                                </Text>
                                <Text style={s.heroSub}>Your community is active — check what's new.</Text>
                            </View>
                            <Text style={s.heroDeco}>Suot</Text>
                        </View>

                        {/* ── SEASONAL CARD ── */}
                        <View style={s.seasonCard}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.seasonLabel}>{seasonal.label}</Text>
                                <Text style={s.seasonTitle}>{seasonal.title}</Text>
                                <Text style={s.seasonSub}>{seasonal.sub}</Text>
                            </View>
                            <TouchableOpacity style={s.seasonBtn} onPress={() => router.push('/dashboard' as any)}>
                                <Text style={s.seasonBtnTxt}>Browse</Text>
                            </TouchableOpacity>
                        </View>

                        {/* ── COMPOSE TRIGGER ── */}
                        <TouchableOpacity style={s.composeTrigger} onPress={() => setComposeVisible(true)}>
                            <Image source={{ uri: myAv }} style={s.composeTriggerAv} />
                            <Text style={s.composeTriggerPh}>Share something with your community…</Text>
                            <IconImage size={20} color="#bbb" />
                        </TouchableOpacity>

                        {/* ── HASHTAG CHIPS ── */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hashRow}>
                            {HASHTAGS.map(tag => (
                                <TouchableOpacity
                                    key={tag}
                                    style={[s.hashChip, activeTag === tag && s.hashChipActive]}
                                    onPress={() => setActiveTag(tag)}>
                                    <Text style={[s.hashTxt, activeTag === tag && s.hashTxtActive]}>
                                        {tag === 'all' ? 'All' : `#${tag}`}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {filteredPosts.length === 0 && !loading && (
                            <View style={s.emptyFeed}>
                                <View style={s.emptyIcon}>
                                    <Ionicons name="people-outline" size={40} color="#ccc" />
                                </View>
                                <Text style={s.emptyH}>Nothing here yet</Text>
                                <Text style={s.emptyP}>Follow people or be the first to post!</Text>
                            </View>
                        )}
                    </>
                }
                renderItem={({ item }) => <PostCard post={item} />}
            />

            {/* ── BOTTOM NAV ── */}
            <View style={s.nav}>
                <TouchableOpacity style={s.navItem}>
                    <Ionicons name="home" size={24} color={ROSE} />
                    <Text style={[s.navTxt, { color: ROSE }]}>Home</Text>
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
                        {unreadCount > 0 && <View style={s.navBadge}><Text style={s.navBadgeTxt}>{unreadCount}</Text></View>}
                    </View>
                    <Text style={s.navTxt}>Messages</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem} onPress={() => router.push('/profile' as any)}>
                    <Ionicons name="person-outline" size={24} color="#aaa" />
                    <Text style={s.navTxt}>Profile</Text>
                </TouchableOpacity>
            </View>

            {/* ══════════════════════════════════
                STORY VIEWER
            ══════════════════════════════════ */}
            <Modal visible={svVisible} animationType="fade" statusBarTranslucent onRequestClose={() => setSvVisible(false)}>
                <View style={sv.root}>
                    <StoryBars total={stories.length} current={svIdx} progress={svProg} />

                    <View style={sv.header}>
                        <Image source={{ uri: stories[svIdx]?.owner.av }} style={sv.hdrAv} />
                        <View style={{ flex: 1 }}>
                            <Text style={sv.hdrName}>{stories[svIdx]?.owner.name}</Text>
                            <Text style={sv.hdrTime}>{stories[svIdx] ? timeAgo(stories[svIdx].created_at) : ''}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSvVisible(false)} style={{ padding: 8 }}>
                            <Ionicons name="close" size={26} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {stories[svIdx] && (
                        <Image source={{ uri: stories[svIdx].image_url }} style={sv.img} resizeMode="cover" />
                    )}

                    {!!stories[svIdx]?.label && (
                        <View style={sv.labelWrap}>
                            <Text style={sv.labelTxt}>{stories[svIdx].label}</Text>
                        </View>
                    )}

                    {/* Tap left / right */}
                    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
                        <View style={{ flex: 1, flexDirection: 'row', marginTop: 130 }}>
                            <Pressable style={{ flex: 1 }} onPress={() => {
                                const prev = svIdx - 1
                                if (prev >= 0) { setSvIdx(prev); runSvProg(prev) }
                            }} />
                            <Pressable style={{ flex: 1 }} onPress={() => advanceSv(svIdx)} />
                        </View>
                    </View>

                    {/* Footer — owner: viewers list, others: reply bar */}
                    {stories[svIdx]?.owner.id === me?.id ? (
                        // ── OWNER: show who viewed ──
                        <View style={sv.viewersPanel}>
                            <View style={sv.viewersHeader}>
                                <Ionicons name="eye-outline" size={14} color="rgba(255,255,255,0.6)" />
                                <Text style={sv.viewersTitle}>Viewed by</Text>
                            </View>
                            {svViewersLoading ? (
                                <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
                            ) : svViewers.length === 0 ? (
                                <Text style={sv.viewersEmpty}>No views yet</Text>
                            ) : (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                                    {svViewers.map((v: any) => {
                                        const vp   = v.profiles || {}
                                        const vName = vp.display_name || vp.username || 'User'
                                        return (
                                            <View key={v.id} style={sv.viewerBubble}>
                                                <Image source={{ uri: avUrl(vName, vp.avatar_url) }} style={sv.viewerAv} />
                                                <Text style={sv.viewerName} numberOfLines={1}>{vName.split(' ')[0]}</Text>
                                            </View>
                                        )
                                    })}
                                </ScrollView>
                            )}
                        </View>
                    ) : (
                        // ── VIEWER: reply bar ──
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sv.replyKAV}>
                            <View style={sv.replyBar}>
                                <TextInput
                                    style={sv.replyInput}
                                    placeholder="Reply to story…"
                                    placeholderTextColor="rgba(255,255,255,0.45)"
                                    value={svReplyText}
                                    onChangeText={setSvReplyText}
                                    returnKeyType="send"
                                    onSubmitEditing={sendStoryReply}
                                />
                                <TouchableOpacity
                                    style={{ padding: 4, opacity: svReplyText.trim() ? 1 : 0.4 }}
                                    onPress={sendStoryReply}
                                    disabled={svReplySending || !svReplyText.trim()}>
                                    {svReplySending
                                        ? <ActivityIndicator size="small" color="#fff" />
                                        : <IconSend size={18} color="#fff" />
                                    }
                                </TouchableOpacity>
                            </View>
                        </KeyboardAvoidingView>
                    )}
                </View>
            </Modal>

            {/* ══════════════════════════════════
                COMPOSE MODAL
            ══════════════════════════════════ */}
            <Modal visible={composeVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setComposeVisible(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={cm.root}>
                        <View style={cm.header}>
                            <TouchableOpacity onPress={() => { setComposeVisible(false); setLinkedItem(null) }}>
                                <Text style={cm.cancel}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={cm.title}>New Post</Text>
                            <TouchableOpacity
                                onPress={submitPost}
                                disabled={(!composeText.trim() && !composeImgUri) || composing}>
                                {composing
                                    ? <ActivityIndicator size="small" color={ROSE} />
                                    : <Text style={[cm.share, { opacity: (composeText.trim() || composeImgUri) ? 1 : 0.3 }]}>Share</Text>
                                }
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ padding: 16 }}>
                            <View style={cm.inputRow}>
                                <Image source={{ uri: myAv }} style={cm.av} />
                                <View style={{ flex: 1 }}>
                                    <Text style={cm.uname}>{dName}</Text>
                                    <TextInput
                                        style={cm.textInput}
                                        placeholder="Share something with your community…"
                                        placeholderTextColor="#bbb"
                                        value={composeText}
                                        onChangeText={setComposeText}
                                        multiline autoFocus
                                    />
                                </View>
                            </View>

                            {composeImgUri && (
                                <View style={cm.imgWrap}>
                                    <Image source={{ uri: composeImgUri }} style={cm.imgPreview} resizeMode="cover" />
                                    <TouchableOpacity style={cm.imgRm} onPress={() => setComposeImgUri(null)}>
                                        <IconClose size={16} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Linked item preview */}
                            {linkedItem && (
                                <View style={cm.linkedItem}>
                                    <Image
                                        source={{ uri: linkedItem.images?.[0] || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200' }}
                                        style={cm.linkedItemImg}
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text style={cm.linkedItemLabel}>Linked Item</Text>
                                        <Text style={cm.linkedItemName} numberOfLines={1}>{linkedItem.name}</Text>
                                        <Text style={cm.linkedItemPts}>{(linkedItem.pts || 0).toLocaleString()} pts</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setLinkedItem(null)} style={{ padding: 4 }}>
                                        <Ionicons name="close" size={18} color="#bbb" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </ScrollView>

                        <View style={cm.toolbar}>
                            <TouchableOpacity style={cm.toolBtn} onPress={pickComposeImage}>
                                <IconImage size={20} color={GREEN} />
                                <Text style={cm.toolBtnTxt}>Photo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={cm.toolBtn} onPress={openItemPicker}>
                                <IconTag size={20} color={GREEN} />
                                <Text style={cm.toolBtnTxt}>Link Item</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ══════════════════════════════════
                ITEM PICKER MODAL
            ══════════════════════════════════ */}
            <Modal visible={itemPickerVisible} animationType="slide" presentationStyle="pageSheet"
                onRequestClose={() => setItemPickerVisible(false)}>
                <View style={ip.root}>
                    <View style={ip.header}>
                        <Text style={ip.title}>Link an Item</Text>
                        <TouchableOpacity onPress={() => setItemPickerVisible(false)}>
                            <Ionicons name="close" size={22} color="#555" />
                        </TouchableOpacity>
                    </View>
                    {itemsLoading ? (
                        <ActivityIndicator color={ROSE} style={{ marginTop: 40 }} />
                    ) : myItems.length === 0 ? (
                        <View style={ip.empty}>
                            <Ionicons name="shirt-outline" size={44} color="#ddd" />
                            <Text style={ip.emptyTxt}>You have no listed items yet.</Text>
                            <TouchableOpacity onPress={() => { setItemPickerVisible(false); router.push('/post' as any) }}>
                                <Text style={ip.emptyLink}>Post an item first</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <FlatList
                            data={myItems}
                            keyExtractor={i => i.id}
                            contentContainerStyle={{ padding: 12 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={ip.row}
                                    onPress={() => { setLinkedItem(item); setItemPickerVisible(false) }}>
                                    <Image
                                        source={{ uri: item.images?.[0] || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200' }}
                                        style={ip.rowImg}
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text style={ip.rowName} numberOfLines={1}>{item.name}</Text>
                                        <Text style={ip.rowMeta}>{(item.pts || 0).toLocaleString()} pts · {item.category}</Text>
                                    </View>
                                    {linkedItem?.id === item.id && (
                                        <Ionicons name="checkmark-circle" size={22} color={GREEN} />
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            </Modal>

            {/* ══════════════════════════════════
                NOTIFICATIONS MODAL
            ══════════════════════════════════ */}
            <Modal visible={notifVisible} animationType="slide" presentationStyle="pageSheet"
                onRequestClose={() => setNotifVisible(false)}>
                <View style={nf.root}>
                    <View style={nf.header}>
                        <Text style={nf.title}>Notifications</Text>
                        <TouchableOpacity onPress={() => setNotifVisible(false)}>
                            <Ionicons name="close" size={22} color="#555" />
                        </TouchableOpacity>
                    </View>
                    {notifsLoading ? (
                        <ActivityIndicator color={ROSE} style={{ marginTop: 40 }} />
                    ) : notifs.length === 0 ? (
                        <View style={nf.empty}>
                            <Ionicons name="notifications-outline" size={48} color="#ddd" />
                            <Text style={nf.emptyTxt}>No notifications yet</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={notifs}
                            keyExtractor={n => n.id}
                            contentContainerStyle={{ paddingVertical: 8 }}
                            ItemSeparatorComponent={() => <View style={nf.sep} />}
                            renderItem={({ item: n }) => {
                                const iconMap: Record<string, { name: string; color: string }> = {
                                    like:         { name: 'heart',              color: '#e05577' },
                                    comment:      { name: 'chatbubble',         color: '#3897f0' },
                                    follow:       { name: 'person-add',         color: GREEN     },
                                    reply:        { name: 'return-down-forward',color: '#f59e0b' },
                                    swap_request: { name: 'swap-horizontal',    color: ROSE      },
                                    friend:       { name: 'people',             color: GREEN     },
                                }
                                const ic = iconMap[n.type] || { name: 'notifications', color: '#aaa' }
                                return (
                                    <TouchableOpacity
                                        style={[nf.row, !n.read && nf.rowUnread]}
                                        onPress={() => { setNotifVisible(false); if (n.link) router.push(n.link as any) }}>
                                        <View style={[nf.iconWrap, { backgroundColor: ic.color + '18' }]}>
                                            <Ionicons name={ic.name as any} size={18} color={ic.color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={nf.msg}>{n.message?.replace(/<[^>]+>/g, '') || 'New notification'}</Text>
                                            <Text style={nf.time}>{timeAgo(n.created_at)}</Text>
                                        </View>
                                        {!n.read && <View style={nf.dot} />}
                                    </TouchableOpacity>
                                )
                            }}
                        />
                    )}
                </View>
            </Modal>

            {/* ══════════════════════════════════
                COMMENTS MODAL
            ══════════════════════════════════ */}
            <Modal visible={cmtVisible} animationType="slide" presentationStyle="pageSheet"
                onRequestClose={() => { setCmtVisible(false); setCmtPostId(null) }}>
                <View style={cmt.root}>
                    <View style={cmt.header}>
                        <Text style={cmt.title}>Comments</Text>
                        <TouchableOpacity onPress={() => { setCmtVisible(false); setCmtPostId(null) }}>
                            <IconClose size={22} />
                        </TouchableOpacity>
                    </View>

                    {cmtLoading
                        ? <ActivityIndicator color={ROSE} style={{ marginTop: 40 }} />
                        : (
                            <FlatList
                                data={comments}
                                keyExtractor={c => c.id}
                                contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
                                ListEmptyComponent={<Text style={cmt.empty}>No comments yet — be the first!</Text>}
                                renderItem={({ item: c }) => {
                                    const cp    = c.profiles || {} as any
                                    const cName = cp.display_name || cp.username || 'User'
                                    return (
                                        <View style={cmt.row}>
                                            <Image source={{ uri: avUrl(cName, cp.avatar_url) }} style={cmt.av} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={cmt.body}>
                                                    <Text style={cmt.cmtUser}>{cName}{'  '}</Text>
                                                    {c.text}
                                                </Text>
                                                <Text style={cmt.time}>{timeAgo(c.created_at)}</Text>
                                            </View>
                                        </View>
                                    )
                                }}
                            />
                        )
                    }

                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={cmt.inputBar}>
                            <Image source={{ uri: myAv }} style={cmt.inputAv} />
                            <TextInput
                                style={cmt.input}
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
                                    : <Text style={[cmt.postBtn, { opacity: cmtText.trim() ? 1 : 0.3 }]}>Post</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Dismiss reaction picker on tap outside */}
            {reactPostId && (
                <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setReactPostId(null)} />
            )}
        </View>
    )
}

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
    root:     { flex: 1, backgroundColor: '#fff' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    topLogo:     { fontSize: 26, fontWeight: '700', color: DARK, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', letterSpacing: -0.5 },
    topBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    topBadge:    { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: '#fff' },
    topBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: '800' },

    storiesWrap:  { backgroundColor: '#fff' },
    storiesRow:   { paddingHorizontal: 12, paddingVertical: 12, gap: 14 },
    storyBubble:  { alignItems: 'center', width: 66 },
    storyLbl:     { fontSize: 10.5, color: '#333', marginTop: 5, textAlign: 'center', width: 64, fontWeight: '500' },
    storyAddOuter:{ width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: '#dbdbdb', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    storyAddImg:  { width: 57, height: 57, borderRadius: 28.5 },
    storyAddPlus: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: '#3897f0', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
    storyAv:      { width: 56, height: 56, borderRadius: 28 },

    hairline:  { height: 0.5, backgroundColor: '#ececec' },

    hero:       { margin: 14, backgroundColor: GREEN, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', minHeight: 100 },
    heroGreet:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(255,255,255,0.45)', marginBottom: 6 },
    heroName:   { fontSize: 19, fontWeight: '700', color: '#fff', lineHeight: 23, marginBottom: 4 },
    heroNameEm: { color: '#f0dfe5', fontStyle: 'italic' },
    heroSub:    { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', lineHeight: 16 },
    heroDeco:   { position: 'absolute', right: 14, bottom: -6, fontSize: 64, fontWeight: '800', color: 'rgba(255,255,255,0.05)', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },

    seasonCard:   { marginHorizontal: 14, marginBottom: 14, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d' },
    seasonLabel:  { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: 'rgba(0,0,0,0.35)', marginBottom: 2 },
    seasonTitle:  { fontSize: 13.5, fontWeight: '700', color: DARK, marginBottom: 2 },
    seasonSub:    { fontSize: 11, color: 'rgba(0,0,0,0.45)', lineHeight: 15 },
    seasonBtn:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.1)' },
    seasonBtnTxt: { fontSize: 12, fontWeight: '700', color: 'rgba(0,0,0,0.55)' },

    composeTrigger:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50, borderWidth: 1, borderColor: '#f0dfe5', backgroundColor: '#fdfbfc' },
    composeTriggerAv: { width: 28, height: 28, borderRadius: 14 },
    composeTriggerPh: { flex: 1, fontSize: 13, color: '#ccc' },

    hashRow:        { paddingHorizontal: 14, paddingBottom: 12, gap: 7, flexDirection: 'row' },
    hashChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 50, borderWidth: 1.5, borderColor: '#ececec', backgroundColor: '#fff' },
    hashChipActive: { backgroundColor: GREEN, borderColor: GREEN },
    hashTxt:        { fontSize: 12.5, fontWeight: '700', color: '#888' },
    hashTxtActive:  { color: '#fff' },

    emptyFeed: { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyIcon: { width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, borderColor: '#eee', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyH:    { fontSize: 18, fontWeight: '700', color: '#aaa' },
    emptyP:    { fontSize: 13, color: '#ccc' },

    nav:         { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 0.5, borderTopColor: '#ececec', paddingBottom: 28, paddingTop: 10 },
    navItem:     { flex: 1, alignItems: 'center', gap: 3 },
    navTxt:      { fontSize: 10, color: '#aaa', fontWeight: '600' },
    navIconWrap: { position: 'relative' },
    navBadge:    { position: 'absolute', top: -3, right: -6, backgroundColor: ROSE, minWidth: 15, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: '#fff' },
    navBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: '800' },
})

// Post card
const pc = StyleSheet.create({
    card:        { backgroundColor: '#fff', marginBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#f5f5f5' },
    header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
    avatar:      { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#f0dfe5' },
    author:      { fontSize: 13.5, fontWeight: '700', color: DARK },
    time:        { fontSize: 11, color: '#aaa', marginTop: 1 },
    moreBtn:     { padding: 6 },
    image:       { width: W, height: W, backgroundColor: '#f5f0f2' },

    captionWrap: { paddingHorizontal: 14, paddingBottom: 2 },
    caption:     { fontSize: 13.5, color: DARK, lineHeight: 20 },
    captionTag:  { color: ROSE, fontWeight: '600' },

    // Linked item card
    linkedCard:    { marginHorizontal: 12, marginBottom: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#f0dfe5', flexDirection: 'row', backgroundColor: '#fdfbfc', alignItems: 'stretch' },
    linkedImg:     { width: 72, backgroundColor: '#f5f0f2' },
    linkedInfo:    { flex: 1, paddingHorizontal: 11, paddingVertical: 10 },
    linkedLabel:   { fontSize: 8.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: ROSE, marginBottom: 3 },
    linkedName:    { fontSize: 13, fontWeight: '700', color: DARK, lineHeight: 17, marginBottom: 5 },
    linkedMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    linkedPts:     { fontSize: 12.5, fontWeight: '800', color: GREEN },
    linkedCatPill: { backgroundColor: '#eaf3f0', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 50 },
    linkedCat:     { fontSize: 10, fontWeight: '700', color: GREEN },
    linkedSwapBtn: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: GREEN, paddingHorizontal: 12, minWidth: 54 },
    linkedSwapTxt: { fontSize: 10.5, fontWeight: '800', color: '#fff' },

    actions:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
    actionBtn:         { padding: 5 },
    rxPicker:          { position: 'absolute', bottom: 44, left: -8, flexDirection: 'row', gap: 2, backgroundColor: '#fff', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 10, zIndex: 200 },
    rxPickerBtn:       { padding: 5, borderRadius: 50 },
    rxPickerBtnActive: { backgroundColor: '#f5f0f2' },

    countsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 3 },
    rxLine:    { fontSize: 13, fontWeight: '700', color: DARK },
    viewCmt:   { fontSize: 13, color: '#aaa' },
    postDate:  { fontSize: 10, color: '#bbb', paddingHorizontal: 14, paddingBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
})

// Story viewer
const sv = StyleSheet.create({
    root:       { flex: 1, backgroundColor: '#000' },
    bars:       { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingTop: 58 },
    track:      { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1 },
    fill:       { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
    header:     { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 72, paddingBottom: 10 },
    hdrAv:      { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
    hdrName:    { fontSize: 14, fontWeight: '700', color: '#fff' },
    hdrTime:    { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
    img:        { width: '100%', height: '100%' },
    labelWrap:  { position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
    labelTxt:   { color: '#fff', fontSize: 15, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 50, overflow: 'hidden' },
    replyKAV:       { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 },
    replyBar:       { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.08)' },
    replyInput:     { flex: 1, color: '#fff', fontSize: 13 },
    viewersPanel:   { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, paddingHorizontal: 16, paddingBottom: 36, paddingTop: 12 },
    viewersHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    viewersTitle:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.8 },
    viewersEmpty:   { fontSize: 12, color: 'rgba(255,255,255,0.4)', paddingVertical: 4 },
    viewerBubble:   { alignItems: 'center', marginRight: 14, width: 50 },
    viewerAv:       { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', marginBottom: 4 },
    viewerName:     { fontSize: 10, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
})

// Compose
const cm = StyleSheet.create({
    root:      { flex: 1, backgroundColor: '#fff' },
    header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    title:     { fontSize: 15, fontWeight: '700', color: DARK },
    cancel:    { fontSize: 15, color: '#555' },
    share:     { fontSize: 15, fontWeight: '700', color: '#3897f0' },
    inputRow:  { flexDirection: 'row', gap: 12, marginBottom: 14 },
    av:        { width: 40, height: 40, borderRadius: 20, flexShrink: 0 },
    uname:     { fontSize: 13.5, fontWeight: '700', color: DARK, marginBottom: 4 },
    textInput: { fontSize: 15, color: DARK, lineHeight: 22, minHeight: 80 },
    imgWrap:       { borderRadius: 12, overflow: 'hidden', marginBottom: 14, position: 'relative' },
    imgPreview:    { width: '100%', height: 240, borderRadius: 12 },
    imgRm:         { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
    linkedItem:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#f0dfe5', borderRadius: 14, padding: 10, marginBottom: 14, backgroundColor: '#fdfbfc' },
    linkedItemImg: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#f5f0f2', flexShrink: 0 },
    linkedItemLabel:{ fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, color: ROSE, marginBottom: 2 },
    linkedItemName: { fontSize: 13, fontWeight: '700', color: DARK },
    linkedItemPts:  { fontSize: 11, color: GREEN, fontWeight: '600', marginTop: 1 },
    toolbar:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: '#ececec' },
    toolBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50, backgroundColor: '#f0f7f5', borderWidth: 1, borderColor: '#ddeae7' },
    toolBtnTxt:    { fontSize: 13, fontWeight: '700', color: GREEN },
})

// Comments
const cmt = StyleSheet.create({
    root:     { flex: 1, backgroundColor: '#fff' },
    header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    title:    { fontSize: 15, fontWeight: '700', color: DARK },
    empty:    { textAlign: 'center', color: '#ccc', paddingVertical: 30, fontSize: 14 },
    row:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
    av:       { width: 32, height: 32, borderRadius: 16, flexShrink: 0 },
    body:     { fontSize: 13.5, color: DARK, lineHeight: 20, flex: 1 },
    cmtUser:  { fontWeight: '700' },
    time:     { fontSize: 11, color: '#aaa', marginTop: 2 },
    inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 30, borderTopWidth: 0.5, borderTopColor: '#ececec', backgroundColor: '#fff' },
    inputAv:  { width: 30, height: 30, borderRadius: 15 },
    input:    { flex: 1, fontSize: 13.5, color: DARK, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#f8f8f8', borderRadius: 24 },
    postBtn:  { fontSize: 14, fontWeight: '700', color: '#3897f0' },
})

// Item picker
const ip = StyleSheet.create({
    root:     { flex: 1, backgroundColor: '#fff' },
    header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    title:    { fontSize: 15, fontWeight: '700', color: DARK },
    empty:    { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyTxt: { fontSize: 14, color: '#aaa' },
    emptyLink:{ fontSize: 14, fontWeight: '700', color: '#3897f0', marginTop: 4 },
    row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#f5f5f5' },
    rowImg:   { width: 52, height: 52, borderRadius: 10, backgroundColor: '#f5f0f2' },
    rowName:  { fontSize: 14, fontWeight: '700', color: DARK, marginBottom: 3 },
    rowMeta:  { fontSize: 12, color: '#aaa' },
})

// Notifications
const nf = StyleSheet.create({
    root:       { flex: 1, backgroundColor: '#fff' },
    header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    title:      { fontSize: 15, fontWeight: '700', color: DARK },
    empty:      { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyTxt:   { fontSize: 14, color: '#aaa' },
    sep:        { height: 0.5, backgroundColor: '#f5f5f5', marginLeft: 68 },
    row:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    rowUnread:  { backgroundColor: '#fdf8fa' },
    iconWrap:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    msg:        { fontSize: 13.5, color: DARK, lineHeight: 19, flex: 1 },
    time:       { fontSize: 11, color: '#aaa', marginTop: 3 },
    dot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: ROSE, flexShrink: 0 },
})