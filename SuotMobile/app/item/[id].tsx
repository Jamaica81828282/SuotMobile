import { useEffect, useState } from 'react'
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Image, ActivityIndicator,
    TextInput, Modal, Dimensions
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import MapView, { Marker } from 'react-native-maps'
import * as Linking from 'expo-linking'
import { supabase } from '../../lib/supabase'

const ROSE  = '#C994A7'
const GREEN = '#4A635D'
const BLUSH = '#EBE0E3'
const { width } = Dimensions.get('window')

function timeAgo(iso: string) {
    if (!iso) return 'Recently'
    const diff  = Date.now() - new Date(iso).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)
    if (mins  < 1)  return 'Just now'
    if (mins  < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days  < 7)  return `${days}d ago`
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// ── CUSTOM ALERT COMPONENT ──────────────────────────────────────
type AlertType = 'info' | 'warning' | 'success' | 'error'

interface CustomAlertProps {
    visible: boolean
    type: AlertType
    title: string
    message: string
    onClose: () => void
    onConfirm?: () => void
    confirmText?: string
}

function CustomAlert({ visible, type, title, message, onClose, onConfirm, confirmText }: CustomAlertProps) {
    const iconMap: Record<AlertType, string> = {
        info:    'information-circle',
        warning: 'alert-circle',
        success: 'checkmark-circle',
        error:   'close-circle',
    }
    const colorMap: Record<AlertType, string> = {
        info:    GREEN,
        warning: '#f97316',
        success: GREEN,
        error:   '#c0392b',
    }
    const bgMap: Record<AlertType, string> = {
        info:    '#f0fdf8',
        warning: '#fff7ed',
        success: '#f0fdf8',
        error:   '#fff0f0',
    }
    const color = colorMap[type]
    const bg    = bgMap[type]

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={alertStyles.overlay}>
                <View style={alertStyles.box}>
                    {/* Icon circle */}
                    <View style={[alertStyles.iconCircle, { backgroundColor: bg }]}>
                        <Ionicons name={iconMap[type] as any} size={32} color={color} />
                    </View>

                    <Text style={alertStyles.title}>{title}</Text>
                    <Text style={alertStyles.message}>{message}</Text>

                    <View style={alertStyles.actions}>
                        {onConfirm && (
                            <TouchableOpacity
                                style={[alertStyles.btnConfirm, { backgroundColor: color }]}
                                onPress={() => { onConfirm(); onClose() }}>
                                <Text style={alertStyles.btnConfirmText}>{confirmText || 'Got it'}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[alertStyles.btnClose, onConfirm && alertStyles.btnCloseSecondary]}
                            onPress={onClose}>
                            <Text style={[alertStyles.btnCloseText, onConfirm && { color: '#aaa' }]}>
                                {onConfirm ? 'Cancel' : 'Got it'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}

const alertStyles = StyleSheet.create({
    overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
    box:             { backgroundColor: '#fff', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 },
    iconCircle:      { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    title:           { fontSize: 18, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 8 },
    message:         { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    actions:         { width: '100%', gap: 10 },
    btnConfirm:      { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    btnConfirmText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
    btnClose:        { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: GREEN },
    btnCloseSecondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#eee' },
    btnCloseText:    { fontWeight: '700', fontSize: 15, color: '#fff' },
})

// ── MAIN SCREEN ────────────────────────────────────────────────
export default function ItemDetailScreen() {
    const router = useRouter()
    const { id } = useLocalSearchParams<{ id: string }>()

    const [item, setItem]               = useState<any>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [loading, setLoading]         = useState(true)
    const [imgIndex, setImgIndex]       = useState(0)
    const [wishlisted, setWishlisted]   = useState(false)
    const [myItems, setMyItems]         = useState<any[]>([])
    const [myBalance, setMyBalance]     = useState(0)
    const [selectedOffer, setSelectedOffer] = useState<any>(null)
    const [offerPts, setOfferPts]       = useState('')
    const [offerMode, setOfferMode]     = useState<'item' | 'item+pts'>('item')
    const [showSwapModal, setShowSwapModal]       = useState(false)
    const [showMessageModal, setShowMessageModal] = useState(false)
    const [messageText, setMessageText] = useState('')
    const [sending, setSending]         = useState(false)
    const [relatedItems, setRelatedItems] = useState<any[]>([])

    // Custom alert state
    const [alertVisible, setAlertVisible] = useState(false)
    const [alertProps, setAlertProps]     = useState<Omit<CustomAlertProps, 'visible' | 'onClose'>>({
        type: 'info', title: '', message: ''
    })

    function showAlert(props: Omit<CustomAlertProps, 'visible' | 'onClose'>) {
        setAlertProps(props)
        setAlertVisible(true)
    }

    useEffect(() => { loadAll() }, [id])

    async function loadAll() {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) setCurrentUser(session.user)

        const { data: itemData } = await supabase
            .from('items')
            .select('*, profiles(id, display_name, username, avatar_url, pts)')
            .eq('id', id).single()

        if (itemData) {
            setItem(itemData)
            if (session) {
                const { data: wl } = await supabase.from('wishlist').select('id')
                    .eq('user_id', session.user.id).eq('item_id', id).maybeSingle()
                setWishlisted(!!wl)
            }
            const { data: related } = await supabase.from('items').select('*')
                .eq('category', itemData.category).neq('id', id).limit(4)
            setRelatedItems(related || [])
        }
        setLoading(false)
    }

    async function openSwapModal() {
        if (!currentUser) { showAlert({ type: 'warning', title: 'Sign In Required', message: 'Please sign in to send a swap request.' }); return }
        if (item.user_id === currentUser.id) { showAlert({ type: 'info', title: 'Your Listing', message: "You can't swap your own item!" }); return }

        const [profileRes, itemsRes] = await Promise.all([
            supabase.from('profiles').select('pts').eq('id', currentUser.id).single(),
            supabase.from('items').select('id, name, images, pts').eq('user_id', currentUser.id)
        ])
        setMyBalance(profileRes.data?.pts || 0)
        setMyItems(itemsRes.data || [])
        setSelectedOffer(null)
        setOfferPts('')
        setOfferMode('item')
        setShowSwapModal(true)
    }

    function handleSelectOffer(mi: any) {
        setSelectedOffer(mi)
        const diff = item.pts - mi.pts

        if (offerMode === 'item+pts') {
            setOfferPts(diff > 0 ? String(diff) : '0')
        }

        if (diff > 0) {
            showAlert({
                type: 'warning',
                title: 'Price Difference',
                message: `"${mi.name}" is worth ${mi.pts.toLocaleString()} pts — ${diff.toLocaleString()} pts below the asking price of ${item.pts.toLocaleString()} pts.\n\n${offerMode === 'item+pts'
                    ? `We've auto-filled ${diff.toLocaleString()} pts to cover the gap!`
                    : 'Switch to "Item + Points" to add pts and cover the difference.'}`
            })
        } else if (diff < 0) {
            showAlert({
                type: 'info',
                title: 'Above Asking Price',
                message: `"${mi.name}" is worth ${mi.pts.toLocaleString()} pts — ${Math.abs(diff).toLocaleString()} pts above the asking price. The seller may still accept your offer!`
            })
        } else {
            showAlert({
                type: 'success',
                title: 'Perfect Match!',
                message: `"${mi.name}" matches the asking price of ${item.pts.toLocaleString()} pts exactly! Great offer.`
            })
        }
    }

    function handleSwitchToItemPts() {
        setOfferMode('item+pts')
        if (selectedOffer) {
            const gap = item.pts - selectedOffer.pts
            setOfferPts(gap > 0 ? String(gap) : '0')
        }
    }

    async function confirmSwap() {
        if (!selectedOffer) {
            showAlert({ type: 'warning', title: 'No Item Selected', message: 'Please select an item to offer before sending.' })
            return
        }
        const ptsToOffer = offerMode === 'item+pts' ? parseInt(offerPts) || 0 : 0
        if (offerMode === 'item+pts' && ptsToOffer > myBalance) {
            showAlert({
                type: 'error',
                title: 'Not Enough Points',
                message: `You only have ${myBalance.toLocaleString()} pts but you're trying to add ${ptsToOffer.toLocaleString()} pts. Please reduce the points amount.`
            })
            return
        }
        setSending(true)
        try {
            const { data: newSwap, error } = await supabase.from('swaps').insert({
                requester_id:      currentUser.id,
                owner_id:          item.user_id,
                requested_item_id: item.id,
                offered_item_id:   selectedOffer.id,
                offered_pts:       ptsToOffer,
                status:            'pending'
            }).select().single()

            if (error) throw error

            const offerMsg = offerMode === 'item'
                ? `I'd like to swap my "${selectedOffer.name}" for your "${item.name}"!`
                : `I'd like to swap my "${selectedOffer.name}" + ${ptsToOffer.toLocaleString()} pts for your "${item.name}"!`

            await supabase.from('messages').insert({
                from_user_id: currentUser.id,
                to_user_id:   item.user_id,
                item_id:      item.id,
                swap_id:      newSwap.id,
                body:         offerMsg,
                msg_type:     'swap_request',
                read:         false
            })

            setShowSwapModal(false)
            showAlert({ type: 'success', title: 'Swap Request Sent!', message: 'The seller has been notified about your offer.' })
        } catch (e: any) {
            showAlert({ type: 'error', title: 'Something went wrong', message: e.message })
        } finally {
            setSending(false)
        }
    }

   async function sendMessage() {
    if (!messageText.trim()) {
        showAlert({ type: 'warning', title: 'Empty Message', message: 'Please write something before sending.' })
        return
    }
    if (!currentUser) {
        showAlert({ type: 'warning', title: 'Sign In Required', message: 'Please sign in to send messages.' })
        return
    }
    setSending(true)
    try {
        await supabase.from('messages').insert({
            from_user_id: currentUser.id,
            to_user_id:   item.user_id,
            item_id:      item.id,
            body:         messageText.trim(),
            msg_type:     'text',
            read:         false
        })
        setShowMessageModal(false)
        setMessageText('')
        showAlert({ type: 'success', title: 'Message Sent!', message: 'Your message has been delivered to the swapper.' })
    } catch (e: any) {
        showAlert({ type: 'error', title: 'Failed to Send', message: e.message })
    } finally {
        setSending(false)
    }
}
    async function toggleWishlist() {
        if (!currentUser) {
            showAlert({ type: 'warning', title: 'Sign In Required', message: 'Please sign in to save items to your wishlist.' })
            return
        }
        if (wishlisted) {
            await supabase.from('wishlist').delete().eq('user_id', currentUser.id).eq('item_id', item.id)
            setWishlisted(false)
        } else {
            await supabase.from('wishlist').insert({ user_id: currentUser.id, item_id: item.id })
            setWishlisted(true)
            showAlert({ type: 'success', title: 'Saved to Wishlist!', message: `"${item.name}" has been added to your wishlist.` })
        }
    }

    if (loading) return (
        <View style={styles.centered}><ActivityIndicator color={ROSE} size="large" /></View>
    )

    if (!item) return (
        <View style={styles.centered}><Text style={{ color: '#aaa' }}>Item not found</Text></View>
    )

    const imgs          = item.images?.length ? item.images : [item.image || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800']
    const profile       = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
    const swapperName   = profile?.display_name || profile?.username || 'Swapper'
    const swapperHandle = profile?.username ? `@${profile.username}` : '@swapper'
    const swapperAvatar = profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(swapperName)}&background=EBE0E3&color=C994A7`
    const isOwner       = currentUser && item.user_id === currentUser.id
    const hasMap        = item.latitude && item.longitude
    const ptsGap        = selectedOffer ? item.pts - selectedOffer.pts - (parseInt(offerPts) || 0) : null

    return (
        <View style={styles.container}>

            {/* CUSTOM ALERT */}
            <CustomAlert
                visible={alertVisible}
                onClose={() => setAlertVisible(false)}
                {...alertProps}
            />

            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={GREEN} />
                </TouchableOpacity>
                <Text style={styles.headerCat}>{item.category}</Text>
                <TouchableOpacity onPress={toggleWishlist} style={styles.wishlistBtn}>
                    <Ionicons name={wishlisted ? 'heart' : 'heart-outline'} size={22} color={wishlisted ? ROSE : '#bbb'} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

                {/* IMAGE GALLERY */}
                <View style={styles.galleryWrap}>
                    <Image source={{ uri: imgs[imgIndex] }} style={styles.mainImage} resizeMode="cover" />
                    <View style={styles.badges}>
                        <View style={styles.badgeCat}><Text style={styles.badgeCatText}>{item.category}</Text></View>
                        <View style={styles.badgeCond}><Text style={styles.badgeCondText}>{item.condition}</Text></View>
                    </View>
                    {imgs.length > 1 && (
                        <>
                            <TouchableOpacity style={[styles.galleryArrow, styles.galleryPrev]} onPress={() => setImgIndex(i => (i - 1 + imgs.length) % imgs.length)}>
                                <Ionicons name="chevron-back" size={20} color={GREEN} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.galleryArrow, styles.galleryNext]} onPress={() => setImgIndex(i => (i + 1) % imgs.length)}>
                                <Ionicons name="chevron-forward" size={20} color={GREEN} />
                            </TouchableOpacity>
                            <View style={styles.imgCounter}>
                                <Text style={styles.imgCounterText}>{imgIndex + 1} / {imgs.length}</Text>
                            </View>
                        </>
                    )}
                </View>

                {imgs.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow} contentContainerStyle={{ padding: 12, gap: 8 }}>
                        {imgs.map((uri: string, i: number) => (
                            <TouchableOpacity key={i} onPress={() => setImgIndex(i)}>
                                <Image source={{ uri }} style={[styles.thumb, imgIndex === i && styles.thumbActive]} resizeMode="cover" />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                <View style={styles.infoSection}>
                    <View style={styles.eyebrow}>
                        <Text style={styles.eyebrowText}>{item.category}</Text>
                        <View style={styles.dot} />
                        <Text style={styles.eyebrowText}>{item.brand || 'Unbranded'}</Text>
                    </View>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <View style={styles.priceRow}>
                        <Text style={styles.itemPrice}>{item.pts?.toLocaleString()} <Text style={styles.itemPtsLabel}>pts</Text></Text>
                        <View style={styles.listedBadge}><Text style={styles.listedText}>{timeAgo(item.created_at)}</Text></View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metaPills}>
                        <View style={styles.metaPill}><Text style={styles.metaLabel}>Size</Text><Text style={styles.metaVal}>{item.size || '—'}</Text></View>
                        <View style={styles.metaPill}><Text style={styles.metaLabel}>Condition</Text><Text style={styles.metaVal}>{item.condition || '—'}</Text></View>
                        <View style={styles.metaPill}><Text style={styles.metaLabel}>Category</Text><Text style={styles.metaVal}>{item.category || '—'}</Text></View>
                    </View>

                    {item.tags?.length > 0 && (
                        <View style={styles.tagsSection}>
                            <Text style={styles.sectionLabel}>Style Tags</Text>
                            <View style={styles.tagsRow}>
                                {item.tags.map((tag: string, i: number) => (
                                    <View key={i} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
                                ))}
                            </View>
                        </View>
                    )}

                    {item.description && (
                        <View style={styles.descSection}>
                            <Text style={styles.sectionLabel}>Description</Text>
                            <Text style={styles.descText}>{item.description}</Text>
                        </View>
                    )}

                    <View style={styles.divider} />

                    {hasMap && (
                        <View style={styles.mapSection}>
                            <Text style={styles.sectionLabel}>Meetup Location</Text>
                            {item.meetup_address && (
                                <View style={styles.addressPill}>
                                    <Ionicons name="location" size={13} color={GREEN} />
                                    <Text style={styles.addressText} numberOfLines={2}>{item.meetup_address}</Text>
                                </View>
                            )}
                            <MapView
                                style={styles.map}
                                region={{ latitude: item.latitude, longitude: item.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
                                scrollEnabled={false}>
                                <Marker coordinate={{ latitude: item.latitude, longitude: item.longitude }} pinColor={ROSE} />
                            </MapView>
                            <TouchableOpacity style={styles.directionsBtn} onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`)}>
                                <Ionicons name="navigate-outline" size={14} color={GREEN} />
                                <Text style={styles.directionsBtnText}>Get Directions</Text>
                            </TouchableOpacity>
                            <View style={styles.divider} />
                        </View>
                    )}

                    <Text style={styles.sectionLabel}>Listed by</Text>
                    <TouchableOpacity style={styles.swapperCard} onPress={() => router.push('/profile' as any)}>
                        <Image source={{ uri: swapperAvatar }} style={styles.swapperAvatar} />
                        <View style={styles.swapperInfo}>
                            <Text style={styles.swapperName}>{swapperName}</Text>
                            <Text style={styles.swapperHandle}>{swapperHandle}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={ROSE} />
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    {!isOwner ? (
                        <View style={styles.actionArea}>
                            <TouchableOpacity style={styles.btnSwap} onPress={openSwapModal}>
                                <Ionicons name="swap-horizontal" size={18} color="#fff" />
                                <Text style={styles.btnSwapText}>Swap Now</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnMessage} onPress={() => setShowMessageModal(true)}>
                                <Ionicons name="chatbubble-outline" size={16} color={ROSE} />
                                <Text style={styles.btnMessageText}>Message Swapper</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btnWishlist, wishlisted && styles.btnWishlistSaved]} onPress={toggleWishlist}>
                                <Ionicons name={wishlisted ? 'heart' : 'heart-outline'} size={15} color={wishlisted ? ROSE : '#bbb'} />
                                <Text style={[styles.btnWishlistText, wishlisted && { color: ROSE }]}>
                                    {wishlisted ? 'Saved ★' : 'Save to Wishlist'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.ownerNote}>
                            <Ionicons name="information-circle-outline" size={16} color={GREEN} />
                            <Text style={styles.ownerNoteText}>This is your listing</Text>
                        </View>
                    )}

                    {relatedItems.length > 0 && (
                        <View style={styles.relatedSection}>
                            <Text style={styles.relatedTitle}>More from this category</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                                {relatedItems.map(r => (
                                    <TouchableOpacity key={r.id} style={styles.relatedCard} onPress={() => router.push(`/item/${r.id}` as any)}>
                                        <Image source={{ uri: r.images?.[0] || r.image || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400' }} style={styles.relatedImg} resizeMode="cover" />
                                        <View style={styles.relatedInfo}>
                                            <Text style={styles.relatedCat}>{r.category}</Text>
                                            <Text style={styles.relatedName} numberOfLines={1}>{r.name}</Text>
                                            <Text style={styles.relatedPts}>{r.pts?.toLocaleString()} pts</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* ── SWAP MODAL ── */}
            <Modal visible={showSwapModal} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Make an Offer</Text>
                        <TouchableOpacity onPress={() => setShowSwapModal(false)}>
                            <Ionicons name="close" size={24} color="#888" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.modalContent}>
                        <View style={styles.targetItem}>
                            <Image source={{ uri: imgs[0] }} style={styles.targetImg} resizeMode="cover" />
                            <View style={styles.targetInfo}>
                                <Text style={styles.targetLabel}>You want</Text>
                                <Text style={styles.targetName}>{item.name}</Text>
                                <Text style={styles.targetPts}>{item.pts?.toLocaleString()} pts</Text>
                            </View>
                        </View>

                        <View style={styles.offerTabs}>
                            <TouchableOpacity style={[styles.offerTab, offerMode === 'item' && styles.offerTabActive]} onPress={() => { setOfferMode('item'); setOfferPts('') }}>
                                <Text style={[styles.offerTabText, offerMode === 'item' && styles.offerTabTextActive]}>Item Only</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.offerTab, offerMode === 'item+pts' && styles.offerTabActive]} onPress={handleSwitchToItemPts}>
                                <Text style={[styles.offerTabText, offerMode === 'item+pts' && styles.offerTabTextActive]}>Item + Points</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalLabel}>Select your item to offer</Text>
                        {myItems.length === 0 ? (
                            <View style={styles.noItems}>
                                <Text style={styles.noItemsText}>You have no items to offer.</Text>
                                <TouchableOpacity onPress={() => { setShowSwapModal(false); router.push('/post' as any) }}>
                                    <Text style={styles.noItemsLink}>Post one first →</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.myItemsGrid}>
                                {myItems.map(mi => (
                                    <TouchableOpacity
                                        key={mi.id}
                                        style={[styles.myItemCard, selectedOffer?.id === mi.id && styles.myItemCardSelected]}
                                        onPress={() => handleSelectOffer(mi)}>
                                        <Image source={{ uri: mi.images?.[0] || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400' }} style={styles.myItemImg} resizeMode="cover" />
                                        {selectedOffer?.id === mi.id && (
                                            <View style={styles.selectedCheck}>
                                                <Ionicons name="checkmark-circle" size={20} color={GREEN} />
                                            </View>
                                        )}
                                        <Text style={styles.myItemName} numberOfLines={1}>{mi.name}</Text>
                                        <Text style={styles.myItemPts}>{mi.pts?.toLocaleString()} pts</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {offerMode === 'item+pts' && (
                            <View style={styles.ptsOfferWrap}>
                                <View style={styles.ptsOfferHeader}>
                                    <Text style={styles.modalLabel}>Points to add</Text>
                                    <Text style={styles.balanceText}>Balance: {myBalance.toLocaleString()} pts</Text>
                                </View>
                                <TextInput
                                    style={styles.ptsInput}
                                    placeholder="0"
                                    placeholderTextColor="#bbb"
                                    value={offerPts}
                                    onChangeText={setOfferPts}
                                    keyboardType="numeric"
                                />
                                {selectedOffer && offerPts !== '' && (
                                    <View style={[styles.gapHint, ptsGap !== null && ptsGap > 0 ? styles.gapHintShort : ptsGap !== null && ptsGap < 0 ? styles.gapHintOver : styles.gapHintMatch]}>
                                        <Ionicons
                                            name={ptsGap === 0 ? 'checkmark-circle' : ptsGap! > 0 ? 'alert-circle' : 'information-circle'}
                                            size={14}
                                            color={ptsGap === 0 ? GREEN : ptsGap! > 0 ? '#f97316' : GREEN}
                                        />
                                        <Text style={[styles.gapHintText, { color: ptsGap === 0 ? GREEN : ptsGap! > 0 ? '#f97316' : GREEN }]}>
                                            {ptsGap === null ? '' :
                                             ptsGap > 0 ? `Still ${ptsGap.toLocaleString()} pts short of asking price` :
                                             ptsGap < 0 ? `${Math.abs(ptsGap).toLocaleString()} pts over asking price` :
                                             'Total offer matches asking price exactly ✓'}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </ScrollView>
                    <View style={styles.modalActions}>
                        <TouchableOpacity style={styles.modalCancel} onPress={() => setShowSwapModal(false)}>
                            <Text style={styles.modalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modalConfirm, (!selectedOffer || sending) && styles.modalConfirmDisabled]}
                            onPress={confirmSwap} disabled={!selectedOffer || sending}>
                            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Send Swap Request</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── MESSAGE MODAL ── */}
            <Modal visible={showMessageModal} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Message Swapper</Text>
                        <TouchableOpacity onPress={() => setShowMessageModal(false)}>
                            <Ionicons name="close" size={24} color="#888" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.modalContent}>
                        <View style={styles.msgSwapperRow}>
                            <Image source={{ uri: swapperAvatar }} style={styles.msgAvatar} />
                            <View>
                                <Text style={styles.msgToName}>{swapperName}</Text>
                                <Text style={styles.msgToSub}>Re: {item.name}</Text>
                            </View>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                            {['Still available?', 'Open to trades?', 'More photos?', 'Measurements?'].map(p => (
                                <TouchableOpacity key={p} style={styles.quickPrompt} onPress={() => setMessageText(p)}>
                                    <Text style={styles.quickPromptText}>{p}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TextInput
                            style={styles.msgInput}
                            placeholder="Hi! I'm interested in swapping for this item…"
                            placeholderTextColor="#bbb"
                            value={messageText}
                            onChangeText={setMessageText}
                            multiline
                            numberOfLines={5}
                        />
                    </View>
                    <View style={styles.modalActions}>
                        <TouchableOpacity style={styles.modalCancel} onPress={() => setShowMessageModal(false)}>
                            <Text style={styles.modalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.modalConfirm, sending && styles.modalConfirmDisabled]} onPress={sendMessage} disabled={sending}>
                            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Send Message</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

        </View>
    )
}

const styles = StyleSheet.create({
    container:          { flex: 1, backgroundColor: '#FDFBFC' },
    centered:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f0f2' },
    backBtn:            { padding: 6 },
    wishlistBtn:        { padding: 6 },
    headerCat:          { fontSize: 14, fontWeight: '700', color: GREEN },
    galleryWrap:        { position: 'relative', width: '100%', height: width, backgroundColor: BLUSH },
    mainImage:          { width: '100%', height: '100%' },
    badges:             { position: 'absolute', top: 16, left: 16, gap: 6 },
    badgeCat:           { backgroundColor: 'rgba(201,148,167,0.88)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 50 },
    badgeCatText:       { color: '#fff', fontSize: 11, fontWeight: '700' },
    badgeCond:          { backgroundColor: 'rgba(255,255,255,0.88)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(74,99,93,0.15)' },
    badgeCondText:      { color: GREEN, fontSize: 11, fontWeight: '700' },
    galleryArrow:       { position: 'absolute', top: '50%', width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
    galleryPrev:        { left: 12 },
    galleryNext:        { right: 12 },
    imgCounter:         { position: 'absolute', bottom: 14, right: 14, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    imgCounterText:     { color: '#fff', fontSize: 11, fontWeight: '700' },
    thumbRow:           { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f0f2' },
    thumb:              { width: 60, height: 60, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
    thumbActive:        { borderColor: ROSE },
    infoSection:        { padding: 20 },
    eyebrow:            { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    eyebrowText:        { fontSize: 11, fontWeight: '700', color: ROSE, textTransform: 'uppercase', letterSpacing: 1 },
    dot:                { width: 4, height: 4, borderRadius: 2, backgroundColor: ROSE },
    itemName:           { fontSize: 26, fontWeight: '700', color: '#1a1a1a', marginBottom: 10, lineHeight: 32 },
    priceRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
    itemPrice:          { fontSize: 24, fontWeight: '800', color: GREEN },
    itemPtsLabel:       { fontSize: 14, fontWeight: '500', color: '#999' },
    listedBadge:        { backgroundColor: '#f0eded', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    listedText:         { fontSize: 12, color: '#999' },
    divider:            { height: 1, backgroundColor: '#f0eded', marginVertical: 20 },
    metaPills:          { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
    metaPill:           { backgroundColor: '#faf4f6', borderWidth: 1, borderColor: '#f0dfe5', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, minWidth: 90 },
    metaLabel:          { fontSize: 9, fontWeight: '700', color: ROSE, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
    metaVal:            { fontSize: 13, fontWeight: '700', color: GREEN },
    tagsSection:        { marginBottom: 16 },
    tagsRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    tag:                { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 50, borderWidth: 1.5, borderColor: '#eee' },
    tagText:            { fontSize: 12, fontWeight: '600', color: '#666' },
    descSection:        { marginBottom: 16 },
    descText:           { fontSize: 14, color: '#666', lineHeight: 22, marginTop: 8 },
    sectionLabel:       { fontSize: 10, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    mapSection:         { marginBottom: 4 },
    map:                { width: '100%', height: 180, borderRadius: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#f0dfe5' },
    addressPill:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f5f0f2', borderRadius: 10, padding: 10, marginBottom: 8 },
    addressText:        { flex: 1, fontSize: 12, fontWeight: '600', color: GREEN },
    directionsBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
    directionsBtnText:  { fontSize: 12, fontWeight: '700', color: GREEN },
    swapperCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#f0eded', borderRadius: 20, padding: 16, marginBottom: 8 },
    swapperAvatar:      { width: 50, height: 50, borderRadius: 14, borderWidth: 2, borderColor: '#f0dfe5' },
    swapperInfo:        { flex: 1 },
    swapperName:        { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
    swapperHandle:      { fontSize: 12, color: ROSE, fontWeight: '600', marginTop: 2 },
    actionArea:         { gap: 10 },
    btnSwap:            { backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: GREEN, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    btnSwapText:        { color: '#fff', fontWeight: '700', fontSize: 15 },
    btnMessage:         { backgroundColor: '#fff', borderWidth: 2, borderColor: '#f0dfe5', borderRadius: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnMessageText:     { color: ROSE, fontWeight: '700', fontSize: 14 },
    btnWishlist:        { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#eee', borderRadius: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    btnWishlistSaved:   { borderColor: ROSE, backgroundColor: '#faf4f6' },
    btnWishlistText:    { fontSize: 13, fontWeight: '600', color: '#bbb' },
    ownerNote:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f5faf9', borderRadius: 12, padding: 14 },
    ownerNoteText:      { fontSize: 13, fontWeight: '600', color: GREEN },
    relatedSection:     { marginTop: 24 },
    relatedTitle:       { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 14 },
    relatedCard:        { width: 140, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' },
    relatedImg:         { width: '100%', height: 140 },
    relatedInfo:        { padding: 10 },
    relatedCat:         { fontSize: 9, fontWeight: '700', color: '#aaa', textTransform: 'uppercase' },
    relatedName:        { fontSize: 12, fontWeight: '700', color: '#1a1a1a', marginTop: 2 },
    relatedPts:         { fontSize: 12, fontWeight: '700', color: GREEN, marginTop: 3 },
    modalContainer:     { flex: 1, backgroundColor: '#FDFBFC' },
    modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f5f0f2' },
    modalTitle:         { fontSize: 18, fontWeight: '700', color: GREEN },
    modalContent:       { flex: 1, padding: 20 },
    targetItem:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#faf4f6', borderWidth: 1, borderColor: '#f0dfe5', borderRadius: 14, padding: 12, marginBottom: 20 },
    targetImg:          { width: 56, height: 56, borderRadius: 10 },
    targetInfo:         { flex: 1 },
    targetLabel:        { fontSize: 9, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
    targetName:         { fontSize: 14, fontWeight: '700', color: GREEN },
    targetPts:          { fontSize: 12, color: '#aaa', marginTop: 2 },
    modalLabel:         { fontSize: 10, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
    offerTabs:          { flexDirection: 'row', borderWidth: 1.5, borderColor: '#eee', borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
    offerTab:           { flex: 1, paddingVertical: 10, alignItems: 'center' },
    offerTabActive:     { backgroundColor: GREEN },
    offerTabText:       { fontSize: 13, fontWeight: '700', color: '#aaa' },
    offerTabTextActive: { color: '#fff' },
    myItemsGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    myItemCard:         { width: '30%', borderWidth: 2, borderColor: '#eee', borderRadius: 12, overflow: 'hidden', position: 'relative' },
    myItemCardSelected: { borderColor: GREEN },
    selectedCheck:      { position: 'absolute', top: 6, right: 6, backgroundColor: '#fff', borderRadius: 10 },
    myItemImg:          { width: '100%', aspectRatio: 1 },
    myItemName:         { fontSize: 11, fontWeight: '700', padding: 5, color: '#1a1a1a' },
    myItemPts:          { fontSize: 10, color: '#aaa', paddingHorizontal: 5, paddingBottom: 5 },
    noItems:            { alignItems: 'center', paddingVertical: 20, gap: 8 },
    noItemsText:        { fontSize: 13, color: '#aaa' },
    noItemsLink:        { fontSize: 13, fontWeight: '700', color: GREEN },
    ptsOfferWrap:       { backgroundColor: '#faf4f6', borderWidth: 1.5, borderColor: '#f0dfe5', borderRadius: 14, padding: 14, marginBottom: 16 },
    ptsOfferHeader:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    balanceText:        { fontSize: 11, fontWeight: '700', color: GREEN },
    ptsInput:           { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#eee', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '700', color: GREEN },
    gapHint:            { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 10, borderRadius: 10 },
    gapHintShort:       { backgroundColor: 'rgba(249,115,22,0.1)' },
    gapHintOver:        { backgroundColor: 'rgba(74,99,93,0.08)' },
    gapHintMatch:       { backgroundColor: 'rgba(74,99,93,0.08)' },
    gapHintText:        { fontSize: 12, fontWeight: '600' },
    modalActions:       { flexDirection: 'row', gap: 10, padding: 20, borderTopWidth: 1, borderTopColor: '#f5f0f2' },
    modalCancel:        { flex: 1, paddingVertical: 14, borderWidth: 1.5, borderColor: '#eee', borderRadius: 12, alignItems: 'center' },
    modalCancelText:    { fontSize: 14, fontWeight: '600', color: '#999' },
    modalConfirm:       { flex: 2, paddingVertical: 14, backgroundColor: GREEN, borderRadius: 12, alignItems: 'center' },
    modalConfirmDisabled: { opacity: 0.4 },
    modalConfirmText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
    msgSwapperRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    msgAvatar:          { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: '#f0dfe5' },
    msgToName:          { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
    msgToSub:           { fontSize: 12, color: '#aaa', marginTop: 2 },
    quickPrompt:        { paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1.5, borderColor: '#eee', borderRadius: 50, backgroundColor: '#fff' },
    quickPromptText:    { fontSize: 12, fontWeight: '600', color: '#666' },
    msgInput:           { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#eee', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1a1a1a', minHeight: 120, textAlignVertical: 'top', marginTop: 8 },
})