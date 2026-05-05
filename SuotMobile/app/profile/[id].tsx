import { useEffect, useRef, useState } from 'react'
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, FlatList, ActivityIndicator, Modal, TextInput,
    Dimensions, Animated, KeyboardAvoidingView, Platform,
    Alert, Pressable, StatusBar
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

const ROSE      = '#C994A7'
const GREEN     = '#4A635D'
const BLUSH     = '#EBE0E3'
const SCREEN_W  = Dimensions.get('window').width
const GRID_CELL = (SCREEN_W - 3) / 3

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────
type UserProfile = {
    id: string; username: string; display_name: string
    bio: string; avatar_url: string | null
    followers_count: number; following_count: number
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

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function av(name: string, url: string | null) {
    return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=EBE0E3&color=C994A7&size=200`
}
function timeAgo(iso: string) {
    const d = Date.now() - new Date(iso).getTime()
    const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000)
    if (m < 1)  return 'just now'
    if (m < 60) return `${m}m`
    if (h < 24) return `${h}h`
    if (dy < 7) return `${dy}d`
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// ─────────────────────────────────────────────
//  COMPONENT
type FollowUser = {
    id: string; display_name: string; username: string
    avatar_url: string | null; isFollowing?: boolean
}

// ─────────────────────────────────────────────
export default function UserProfileScreen() {
    const router  = useRouter()
    const { id }  = useLocalSearchParams<{ id: string }>()

    const [me,           setMe]           = useState<any>(null)
    const [profile,      setProfile]      = useState<UserProfile | null>(null)
    const [items,        setItems]        = useState<Item[]>([])
    const [stories,      setStories]      = useState<Story[]>([])
    const [followers,    setFollowers]    = useState(0)
    const [following,    setFollowing]    = useState(0)
    const [isFollowing,  setIsFollowing]  = useState(false)
    const [followLoading,setFollowLoading]= useState(false)
    const [loading,      setLoading]      = useState(true)

    // Follow list modal
    const [fmVisible, setFmVisible] = useState(false)
    const [fmType,    setFmType]    = useState<'followers' | 'following'>('followers')
    const [fmList,    setFmList]    = useState<FollowUser[]>([])
    const [fmLoading, setFmLoading] = useState(false)

    // Story viewer
    const [svVisible, setSvVisible] = useState(false)
    const [svIdx,     setSvIdx]     = useState(0)
    const svProg = useRef(new Animated.Value(0)).current
    const svAnim = useRef<Animated.CompositeAnimation | null>(null)
    const [svReplyText,    setSvReplyText]    = useState('')
    const [svReplySending, setSvReplySending] = useState(false)

    // Lightbox
    const [lbVisible,  setLbVisible]  = useState(false)
    const [lbIdx,      setLbIdx]      = useState(0)
    const [lbItem,     setLbItem]     = useState<Item | null>(null)
    const [comments,   setComments]   = useState<Comment[]>([])
    const [cmtLoading, setCmtLoading] = useState(false)
    const [cmtText,    setCmtText]    = useState('')
    const [cmtPosting, setCmtPosting] = useState(false)

    // ── Boot ─────────────────────────────────────
    useEffect(() => { if (id) boot() }, [id])

    async function boot() {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.replace('/login' as any); return }
        setMe(session.user)

        // Don't show this screen for yourself — redirect to own profile
        if (session.user.id === id) {
            router.replace('/profile' as any); return
        }

        const [
            { data: prof },
            { data: userItems },
            { count: fc },
            { count: gc },
            { data: rawStories },
            { data: followRow }
        ] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', id).single(),
            supabase.from('items').select('*').eq('user_id', id).order('created_at', { ascending: false }),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', id),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id),
            supabase.from('stories').select('*').eq('user_id', id).order('created_at', { ascending: false }),
            supabase.from('follows').select('id').eq('follower_id', session.user.id).eq('following_id', id).maybeSingle()
        ])

        if (!prof) { Alert.alert('Not found', 'This profile does not exist.'); router.back(); return }
        setProfile(prof)
        setItems(userItems || [])
        setFollowers(fc || 0)
        setFollowing(gc || 0)
        setIsFollowing(!!followRow)

        const cutoff = Date.now() - 24 * 60 * 60 * 1000
        const validStories = (rawStories || []).filter((s: Story) => new Date(s.created_at).getTime() > cutoff)

        // Check which stories this user has already viewed
        const storyIds = validStories.map((s: Story) => s.id)
        let viewedSet = new Set<string>()
        if (storyIds.length) {
            const { data: vr } = await supabase.from('story_views')
                .select('story_id').eq('viewer_id', session.user.id).in('story_id', storyIds)
            viewedSet = new Set((vr || []).map((r: any) => r.story_id))
        }
        setStories(validStories.map((s: Story) => ({ ...s, viewed: viewedSet.has(s.id) })))
        setLoading(false)
    }

    // ── Follow / Unfollow ─────────────────────────
    async function handleFollow() {
        if (!me || !profile || followLoading) return
        setFollowLoading(true)
        if (isFollowing) {
            await supabase.from('follows').delete()
                .eq('follower_id', me.id).eq('following_id', profile.id)
            setIsFollowing(false)
            setFollowers(f => Math.max(0, f - 1))
        } else {
            await supabase.from('follows').insert({ follower_id: me.id, following_id: profile.id })
            setIsFollowing(true)
            setFollowers(f => f + 1)
            // Send follow notification
            const { data: myProf } = await supabase.from('profiles')
                .select('display_name, username').eq('id', me.id).single()
            const sName = myProf?.display_name || myProf?.username || 'Someone'
            await supabase.from('notifications').insert({
                user_id: profile.id, type: 'follow', read: false,
                message: `${sName} started following you`,
                link: `/profile/${me.id}`
            })
        }
        setFollowLoading(false)
    }

    // ── Follow list modal ─────────────────────────
    async function openFollowModal(type: 'followers' | 'following') {
        setFmType(type); setFmVisible(true); setFmLoading(true)

        let users: FollowUser[] = []
        if (type === 'followers') {
            const { data } = await supabase.from('follows')
                .select('profiles!follows_follower_id_fkey(id, display_name, username, avatar_url)')
                .eq('following_id', id)
            users = (data || []).map((r: any) => r.profiles).filter(Boolean)
        } else {
            const { data } = await supabase.from('follows')
                .select('profiles!follows_following_id_fkey(id, display_name, username, avatar_url)')
                .eq('follower_id', id)
            users = (data || []).map((r: any) => r.profiles).filter(Boolean)
        }

        // Check which ones the current user is already following
        if (users.length && me) {
            const ids = users.map(u => u.id)
            const { data: myFollows } = await supabase.from('follows')
                .select('following_id').eq('follower_id', me.id).in('following_id', ids)
            const followingSet = new Set((myFollows || []).map((r: any) => r.following_id))
            users = users.map(u => ({ ...u, isFollowing: followingSet.has(u.id) }))
        }

        setFmList(users)
        setFmLoading(false)
    }

    async function toggleFollowUser(userId: string, currently: boolean) {
        if (!me) return
        // Optimistic
        setFmList(prev => prev.map(u =>
            u.id === userId ? { ...u, isFollowing: !currently } : u
        ))
        if (currently) {
            await supabase.from('follows').delete()
                .eq('follower_id', me.id).eq('following_id', userId)
        } else {
            await supabase.from('follows').insert({ follower_id: me.id, following_id: userId })
        }
    }

    // ── Message — navigate directly to messages with this person ──
    async function handleMessage() {
        if (!profile) return
        router.push(`/messages?with=${profile.id}` as any)
    }

    // ── Story viewer ─────────────────────────────
    function openStory(idx: number) {
        setSvIdx(idx); setSvVisible(true); runSvProg(idx)
        setSvReplyText('')
        // Mark this story as viewed
        setStories(prev => prev.map((s, i) => i === idx ? { ...s, viewed: true } : s))
        const story = stories[idx]
        if (story) {
            supabase.from('story_views')
                .upsert({ story_id: story.id, viewer_id: me?.id }, { onConflict: 'story_id,viewer_id' })
                .then(() => {})
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
            setStories(prev => prev.map((s, i) => i === next ? { ...s, viewed: true } : s))
            const story = stories[next]
            if (story) {
                supabase.from('story_views')
                    .upsert({ story_id: story.id, viewer_id: me?.id }, { onConflict: 'story_id,viewer_id' })
                    .then(() => {})
            }
            runSvProg(next)
        } else { setSvVisible(false) }
    }

    async function sendStoryReply() {
        if (!svReplyText.trim() || !stories[svIdx] || !profile) return
        setSvReplySending(true)
        await supabase.from('messages').insert({
            from_user_id: me?.id,
            to_user_id:   profile.id,
            body:         `Replied to your story "${stories[svIdx].label || 'story'}": ${svReplyText.trim()}`
        })
        setSvReplyText(''); setSvReplySending(false)
    }

    // ── Lightbox ─────────────────────────────────
    async function openLb(idx: number) {
        setLbIdx(idx); setLbItem(items[idx]); setLbVisible(true)
        setCmtLoading(true)
        const { data } = await supabase
            .from('item_comments')
            .select('*, profiles(id, display_name, username, avatar_url)')
            .eq('item_id', items[idx].id).order('created_at', { ascending: true })
        setComments(data || []); setCmtLoading(false)
    }

    function lbNav(dir: number) {
        const next = lbIdx + dir
        if (next < 0 || next >= items.length) return
        setLbIdx(next); setLbItem(items[next])
        supabase.from('item_comments')
            .select('*, profiles(id, display_name, username, avatar_url)')
            .eq('item_id', items[next].id).order('created_at', { ascending: true })
            .then(({ data }: { data: Comment[] | null }) => setComments(data || []))
    }

    async function postComment() {
        if (!cmtText.trim() || !lbItem || cmtPosting || !me) return
        setCmtPosting(true)
        const { data: saved } = await supabase.from('item_comments')
            .insert({ item_id: lbItem.id, user_id: me.id, text: cmtText.trim() })
            .select('*, profiles(id, display_name, username, avatar_url)').single()
        if (saved) { setComments(p => [...p, saved]); setCmtText('') }
        setCmtPosting(false)
    }

    // ── Render ───────────────────────────────────
    if (loading) return (
        <View style={s.centered}><ActivityIndicator color={ROSE} size="large" /></View>
    )
    if (!profile) return null

    const dName     = profile.display_name || profile.username || 'User'
    const avatarSrc = av(dName, profile.avatar_url)
    const hasStories  = stories.length > 0
    const allViewed   = hasStories && stories.every(s => s.viewed)
    const myAvatar    = av('Me', null)   // fallback for comment input

    return (
        <View style={s.root}>
            <StatusBar barStyle="dark-content" />

            {/* ── HEADER ── */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.hBtn}>
                    <Ionicons name="arrow-back" size={22} color="#1a1a1a" />
                </TouchableOpacity>
                <Text style={s.hTitle}>{profile.username}</Text>
                <View style={s.hBtn} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

                {/* ── PROFILE ROW ── */}
                {/* ── PROFILE SECTION ── */}
                <View style={s.profileSection}>

                    {/* Top row: avatar + stats */}
                    <View style={s.topRow}>
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

                        <View style={s.statsRow}>
                            <View style={s.stat}>
                                <Text style={s.statNum}>{items.length}</Text>
                                <Text style={s.statLbl}>Posts</Text>
                            </View>
                            <View style={s.statDivider} />
                            <TouchableOpacity style={s.stat} onPress={() => openFollowModal('followers')}>
                                <Text style={s.statNum}>{followers}</Text>
                                <Text style={s.statLbl}>Followers</Text>
                            </TouchableOpacity>
                            <View style={s.statDivider} />
                            <TouchableOpacity style={s.stat} onPress={() => openFollowModal('following')}>
                                <Text style={s.statNum}>{following}</Text>
                                <Text style={s.statLbl}>Following</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Name + bio */}
                    <Text style={s.bioName}>{dName}</Text>
                    {!!profile.bio && <Text style={s.bioText}>{profile.bio}</Text>}

                    {/* Items available badge */}
                    {items.length > 0 && (
                        <View style={s.swapBadge}>
                            <Ionicons name="swap-horizontal" size={12} color={GREEN} />
                            <Text style={s.swapBadgeTxt}>{items.length} item{items.length !== 1 ? 's' : ''} available to swap</Text>
                        </View>
                    )}

                    {/* ── ACTION BUTTONS ── */}
                    <View style={s.actionBtns}>
                        {/* Follow / Following / Unfollow */}
                        <TouchableOpacity
                            style={[s.followBtn, isFollowing && s.followBtnFollowing]}
                            onPress={handleFollow}
                            disabled={followLoading}
                            activeOpacity={0.8}>
                            {followLoading
                                ? <ActivityIndicator size="small" color={isFollowing ? '#1a1a1a' : '#fff'} />
                                : <>
                                    <Ionicons
                                        name={isFollowing ? 'checkmark' : 'person-add-outline'}
                                        size={14}
                                        color={isFollowing ? '#1a1a1a' : '#fff'}
                                    />
                                    <Text style={[s.followBtnTxt, isFollowing && s.followBtnTxtFollowing]}>
                                        {isFollowing ? 'Following' : 'Follow'}
                                    </Text>
                                  </>
                            }
                        </TouchableOpacity>

                        {/* Message button */}
                        <TouchableOpacity
                            style={s.msgBtn}
                            onPress={handleMessage}
                            activeOpacity={0.8}>
                            <Ionicons name="chatbubble-outline" size={14} color="#1a1a1a" />
                            <Text style={s.msgBtnTxt}>Message</Text>
                        </TouchableOpacity>

                        {/* More options (3-dot) */}
                        <TouchableOpacity style={s.moreBtn} activeOpacity={0.7}>
                            <Ionicons name="chevron-down" size={14} color="#1a1a1a" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── GRID ── */}
                <View style={s.tabBar}>
                    <View style={[s.tab, s.tabActive]}>
                        <Ionicons name="grid-outline" size={22} color="#1a1a1a" />
                    </View>
                </View>

                {items.length === 0 ? (
                    <View style={s.empty}>
                        <View style={s.emptyCircle}>
                            <Ionicons name="camera-outline" size={36} color="#ccc" />
                        </View>
                        <Text style={s.emptyH}>No Posts Yet</Text>
                        <Text style={s.emptyP}>When {dName} posts items, they'll appear here.</Text>
                    </View>
                ) : (
                    <View style={s.grid}>
                        {items.map((item, idx) => (
                            <TouchableOpacity key={item.id} onPress={() => openLb(idx)} activeOpacity={0.9}>
                                <Image
                                    source={{ uri: item.images?.[0] || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400' }}
                                    style={s.gridCell}
                                />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <View style={{ height: 80 }} />
            </ScrollView>

            {/* ══ FOLLOW LIST MODAL ══ */}
            <Modal visible={fmVisible} animationType="slide" presentationStyle="pageSheet"
                onRequestClose={() => setFmVisible(false)}>
                <View style={fm.root}>
                    <View style={fm.header}>
                        <Text style={fm.title}>
                            {fmType === 'followers' ? 'Followers' : 'Following'}
                        </Text>
                        <TouchableOpacity onPress={() => setFmVisible(false)}>
                            <Ionicons name="close" size={22} color="#555" />
                        </TouchableOpacity>
                    </View>

                    {fmLoading ? (
                        <ActivityIndicator color={ROSE} style={{ marginTop: 40 }} />
                    ) : fmList.length === 0 ? (
                        <Text style={fm.empty}>No {fmType} yet.</Text>
                    ) : (
                        <FlatList
                            data={fmList}
                            keyExtractor={u => u.id}
                            ItemSeparatorComponent={() => <View style={fm.sep} />}
                            renderItem={({ item: u }) => {
                                const isMe = u.id === me?.id
                                return (
                                    <View style={fm.row}>
                                        {/* Tappable avatar + name */}
                                        <TouchableOpacity
                                            style={fm.rowLeft}
                                            onPress={() => {
                                                setFmVisible(false)
                                                if (isMe) router.push('/profile' as any)
                                                else router.push(`/profile/${u.id}` as any)
                                            }}>
                                            <Image
                                                source={{ uri: av(u.display_name || u.username, u.avatar_url) }}
                                                style={fm.av}
                                            />
                                            <View>
                                                <Text style={fm.name}>{u.display_name || u.username}</Text>
                                                <Text style={fm.user}>@{u.username}</Text>
                                            </View>
                                        </TouchableOpacity>

                                        {/* Follow / Following button — hidden for self */}
                                        {!isMe && (
                                            <TouchableOpacity
                                                style={u.isFollowing ? fm.followingBtn : fm.followBtn}
                                                onPress={() => toggleFollowUser(u.id, !!u.isFollowing)}>
                                                <Text style={u.isFollowing ? fm.followingTxt : fm.followTxt}>
                                                    {u.isFollowing ? 'Following' : 'Follow'}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )
                            }}
                        />
                    )}
                </View>
            </Modal>

            {/* ══ STORY VIEWER ══ */}
            <Modal visible={svVisible} animationType="fade" statusBarTranslucent onRequestClose={() => setSvVisible(false)}>
                <View style={sv.root}>
                    {/* Progress bars */}
                    <View style={sv.bars}>
                        {stories.map((_, i) => (
                            <View key={i} style={sv.track}>
                                <Animated.View style={[sv.fill, {
                                    width: i < svIdx ? '100%'
                                        : i === svIdx
                                            ? svProg.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                                            : '0%'
                                }]} />
                            </View>
                        ))}
                    </View>

                    {/* Header */}
                    <View style={sv.header}>
                        <Image source={{ uri: avatarSrc }} style={sv.hdrAv} />
                        <View style={{ flex: 1 }}>
                            <Text style={sv.hdrName}>{dName}</Text>
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

                    {/* Tap zones */}
                    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
                        <View style={{ flex: 1, flexDirection: 'row', marginTop: 140 }}>
                            <Pressable style={{ flex: 1 }} onPress={() => {
                                const prev = svIdx - 1
                                if (prev >= 0) { setSvIdx(prev); runSvProg(prev) }
                            }} />
                            <Pressable style={{ flex: 1 }} onPress={() => advanceSv(svIdx)} />
                        </View>
                    </View>

                    {/* Reply bar */}
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
                                    : <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                                }
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ══ LIGHTBOX ══ */}
            <Modal visible={lbVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLbVisible(false)}>
                <View style={lb.root}>
                    <View style={lb.header}>
                        <Image source={{ uri: avatarSrc }} style={lb.hdrAv} />
                        <View style={{ flex: 1 }}>
                            <Text style={lb.hdrName}>{profile.username || dName}</Text>
                            <Text style={lb.hdrSub}>{lbItem ? timeAgo(lbItem.created_at) : ''}</Text>
                        </View>
                        <TouchableOpacity onPress={() => lbNav(-1)}
                            style={[lb.navBtn, lbIdx === 0 && { opacity: 0.25 }]}
                            disabled={lbIdx === 0}>
                            <Ionicons name="chevron-back" size={18} color="#555" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => lbNav(1)}
                            style={[lb.navBtn, lbIdx === items.length - 1 && { opacity: 0.25 }]}
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
                            style={lb.img}
                        />

                        {lbItem && (
                            <View style={lb.body}>
                                <View style={lb.titleRow}>
                                    <Text style={lb.name}>{lbItem.name}</Text>
                                    <Text style={lb.pts}>{(lbItem.pts || 0).toLocaleString()} pts</Text>
                                </View>

                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                                    {[
                                        { l: 'Size', v: lbItem.size || '—' },
                                        { l: 'Condition', v: lbItem.condition || '—' },
                                        { l: 'Category', v: lbItem.category || '—' },
                                        { l: 'Brand', v: lbItem.brand || 'Unbranded' },
                                    ].map(m => (
                                        <View key={m.l} style={lb.pill}>
                                            <Text style={lb.pillLbl}>{m.l}</Text>
                                            <Text style={lb.pillVal}>{m.v}</Text>
                                        </View>
                                    ))}
                                </ScrollView>

                                {lbItem.tags?.length > 0 && (
                                    <View style={lb.tagsRow}>
                                        {lbItem.tags.map(t => (
                                            <View key={t} style={lb.tag}><Text style={lb.tagTxt}>#{t}</Text></View>
                                        ))}
                                    </View>
                                )}

                                {!!lbItem.description && (
                                    <Text style={lb.desc}>{lbItem.description}</Text>
                                )}

                                {/* Swap button */}
                                <TouchableOpacity
                                    style={lb.swapBtn}
                                    onPress={() => { setLbVisible(false); router.push(`/item/${lbItem.id}` as any) }}>
                                    <Ionicons name="swap-horizontal" size={16} color="#fff" />
                                    <Text style={lb.swapTxt}>Request Swap</Text>
                                </TouchableOpacity>

                                <View style={lb.divider} />

                                <Text style={lb.cmtHeading}>Comments</Text>
                                {cmtLoading
                                    ? <ActivityIndicator color={ROSE} style={{ marginVertical: 16 }} />
                                    : comments.length === 0
                                        ? <Text style={lb.cmtEmpty}>No comments yet.</Text>
                                        : comments.map(c => {
                                            const cp    = c.profiles || {} as any
                                            const cName = cp.display_name || cp.username || 'User'
                                            return (
                                                <View key={c.id} style={lb.cmtRow}>
                                                    <Image source={{ uri: av(cName, cp.avatar_url) }} style={lb.cmtAv} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={lb.cmtBody}>
                                                            <Text style={lb.cmtUser}>{cName}  </Text>
                                                            {c.text}
                                                        </Text>
                                                        <Text style={lb.cmtTime}>{timeAgo(c.created_at)}</Text>
                                                    </View>
                                                </View>
                                            )
                                        })
                                }
                            </View>
                        )}
                    </ScrollView>

                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={lb.cmtBar}>
                            <Image source={{ uri: myAvatar }} style={lb.cmtBarAv} />
                            <TextInput
                                style={lb.cmtInput}
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
                                    : <Text style={[lb.cmtPost, { opacity: cmtText.trim() ? 1 : 0.3 }]}>Post</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    )
}

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
    root:     { flex: 1, backgroundColor: '#fff' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Header — username centered, back left
    header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    hTitle:  { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#1a1a1a', letterSpacing: 0.2 },
    hBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

    // Profile section
    profileSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 },

    // Top row: avatar left, stats right (Instagram)
    topRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    avatarRing:      { width: 90, height: 90, borderRadius: 45, borderWidth: 1.5, borderColor: '#dbdbdb', padding: 2 },
    avatarRingLit:   { borderWidth: 2.5, borderColor: ROSE, padding: 2 },
    avatarRingViewed:{ borderWidth: 2, borderColor: '#c7c7c7', padding: 2 },
    avatar:          { width: 82, height: 82, borderRadius: 41, borderWidth: 2, borderColor: '#fff' },

    // Stats row
    statsRow:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingLeft: 10 },
    stat:        { alignItems: 'center', flex: 1 },
    statNum:     { fontSize: 18, fontWeight: '700', color: '#1a1a1a', lineHeight: 22 },
    statLbl:     { fontSize: 12, color: '#555', marginTop: 2 },
    statDivider: { width: 1, height: 24, backgroundColor: '#ececec' },

    // Bio
    bioName:  { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
    bioText:  { fontSize: 13.5, color: '#333', lineHeight: 19, marginBottom: 8 },

    // Swap badge
    swapBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, backgroundColor: '#edf3f1', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 50 },
    swapBadgeTxt: { fontSize: 12, fontWeight: '600', color: GREEN },

    // Action buttons row — Follow | Message | chevron
    actionBtns:          { flexDirection: 'row', gap: 8, marginTop: 4 },
    followBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: '#3897f0' },
    followBtnFollowing:  { backgroundColor: '#f2f2f2', borderWidth: 0.5, borderColor: '#dbdbdb' },
    followBtnTxt:        { fontSize: 13.5, fontWeight: '700', color: '#fff' },
    followBtnTxtFollowing:{ color: '#1a1a1a' },
    msgBtn:              { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f2f2f2', borderWidth: 0.5, borderColor: '#dbdbdb' },
    msgBtnTxt:           { fontSize: 13.5, fontWeight: '700', color: '#1a1a1a' },
    moreBtn:             { width: 38, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#f2f2f2', borderWidth: 0.5, borderColor: '#dbdbdb' },

    // Tabs
    tabBar:   { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#ececec' },
    tab:      { flex: 1, alignItems: 'center', paddingVertical: 10 },
    tabActive:{ borderTopWidth: 1.5, borderTopColor: '#1a1a1a', marginTop: -0.5 },

    // Grid
    grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 1.5 },
    gridCell: { width: GRID_CELL, height: GRID_CELL, backgroundColor: '#f5f0f2' },

    // Empty
    empty:       { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 10 },
    emptyCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyH:      { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
    emptyP:      { fontSize: 13.5, color: '#999', textAlign: 'center', lineHeight: 19 },
})

const sv = StyleSheet.create({
    root:      { flex: 1, backgroundColor: '#000' },
    bars:      { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingTop: 58 },
    track:     { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1 },
    fill:      { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
    header:    { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 72, paddingBottom: 10 },
    hdrAv:     { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
    hdrName:   { fontSize: 14, fontWeight: '700', color: '#fff' },
    hdrTime:   { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
    img:       { width: '100%', height: '100%' },
    labelWrap: { position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
    labelTxt:  { color: '#fff', fontSize: 15, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 50, overflow: 'hidden' },
    replyKAV:  { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 },
    replyBar:  { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.08)' },
    replyInput:{ flex: 1, color: '#fff', fontSize: 13 },
})

const lb = StyleSheet.create({
    root:     { flex: 1, backgroundColor: '#fff' },
    header:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 54, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    hdrAv:    { width: 34, height: 34, borderRadius: 17 },
    hdrName:  { fontSize: 13.5, fontWeight: '700', color: '#1a1a1a' },
    hdrSub:   { fontSize: 11, color: '#aaa' },
    navBtn:   { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#eee', alignItems: 'center', justifyContent: 'center' },
    img:      { width: SCREEN_W, height: SCREEN_W, backgroundColor: '#f5f0f2' },
    body:     { padding: 16 },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    name:     { fontSize: 17, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 10 },
    pts:      { fontSize: 15, fontWeight: '800', color: GREEN },
    pill:     { backgroundColor: '#faf4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
    pillLbl:  { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: ROSE },
    pillVal:  { fontSize: 12.5, fontWeight: '700', color: '#1a1a1a', marginTop: 1 },
    tagsRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    tag:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50, backgroundColor: '#f5f5f5' },
    tagTxt:   { fontSize: 12, color: '#888' },
    desc:     { fontSize: 13.5, color: '#444', lineHeight: 20, marginBottom: 14 },
    swapBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 13, marginBottom: 16 },
    swapTxt:  { fontSize: 14, fontWeight: '700', color: '#fff' },
    divider:  { height: 0.5, backgroundColor: '#ececec', marginBottom: 16 },
    cmtHeading:{ fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
    cmtEmpty: { fontSize: 13, color: '#ccc', textAlign: 'center', paddingVertical: 20 },
    cmtRow:   { flexDirection: 'row', gap: 10, marginBottom: 14 },
    cmtAv:    { width: 30, height: 30, borderRadius: 15 },
    cmtBody:  { fontSize: 13.5, color: '#333', lineHeight: 20, flex: 1 },
    cmtUser:  { fontWeight: '700' },
    cmtTime:  { fontSize: 11, color: '#aaa', marginTop: 2 },
    cmtBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 30, borderTopWidth: 0.5, borderTopColor: '#ececec', backgroundColor: '#fff' },
    cmtBarAv: { width: 30, height: 30, borderRadius: 15 },
    cmtInput: { flex: 1, fontSize: 13.5, color: '#333', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#f8f8f8', borderRadius: 24 },
    cmtPost:  { fontSize: 14, fontWeight: '700', color: '#3897f0' },
})

// Follow modal
const fm = StyleSheet.create({
    root:         { flex: 1, backgroundColor: '#fff' },
    header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#ececec' },
    title:        { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
    empty:        { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
    sep:          { height: 0.5, backgroundColor: '#f5f5f5', marginLeft: 72 },
    row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    rowLeft:      { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    av:           { width: 44, height: 44, borderRadius: 22 },
    name:         { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
    user:         { fontSize: 12, color: '#aaa', marginTop: 1 },
    followBtn:    { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, backgroundColor: '#3897f0' },
    followingBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, backgroundColor: '#f2f2f2', borderWidth: 0.5, borderColor: '#dbdbdb' },
    followTxt:    { fontSize: 13.5, fontWeight: '700', color: '#fff' },
    followingTxt: { fontSize: 13.5, fontWeight: '700', color: '#1a1a1a' },
})