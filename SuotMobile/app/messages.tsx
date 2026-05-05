import { useEffect, useState, useRef } from 'react'
import {
    View, Text, StyleSheet, FlatList,
    TouchableOpacity, Image, ActivityIndicator,
    TextInput, KeyboardAvoidingView, Platform,
    Modal, Alert, Dimensions, PanResponder
} from 'react-native'
// CHANGE 1: added useLocalSearchParams
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import {
    RTCPeerConnection,
    RTCIceCandidate,
    RTCSessionDescription,
    MediaStream,
    mediaDevices,
    RTCView,
} from 'react-native-webrtc'

const ROSE     = '#C994A7'
const GREEN    = '#4A635D'
const BLUSH    = '#EBE0E3'
const FALLBACK = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400'
const { width, height } = Dimensions.get('window')

const ICE_SERVERS = {
  iceServers: [
    { urls: ['stun:hk-turn1.xirsys.com'] },
    {
      username: 'iZqgYbnzH_Brq4IFMFYfnMd9RPtOS-beV1TTLHIUVNKBtDReVRjCvQZix-0AhxuwAAAAAGnH4Z1KYW1haWNh',
      credential: '0b3e8f18-2ab0-11f1-8861-aa4d1230739f',
      urls: [
        'turn:hk-turn1.xirsys.com:80?transport=udp',
        'turn:hk-turn1.xirsys.com:3478?transport=udp',
        'turn:hk-turn1.xirsys.com:80?transport=tcp',
        'turn:hk-turn1.xirsys.com:3478?transport=tcp',
        'turns:hk-turn1.xirsys.com:443?transport=tcp',
        'turns:hk-turn1.xirsys.com:5349?transport=tcp'
      ]
    }
  ]
}

function timeAgo(iso: string) {
    if (!iso) return ''
    const diff  = Date.now() - new Date(iso).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)
    if (mins  < 1)  return 'now'
    if (mins  < 60) return `${mins}m`
    if (hours < 24) return `${hours}h`
    if (days  < 7)  return `${days}d`
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function fmtDate(iso: string) {
    const d = new Date(iso), t = new Date()
    if (d.toDateString() === t.toDateString()) return 'Today'
    const y = new Date(t); y.setDate(t.getDate() - 1)
    if (d.toDateString() === y.toDateString()) return 'Yesterday'
    return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

function gen4() { return String(Math.floor(1000 + Math.random() * 9000)) }

// CHANGE 2: Story reply parser
// Story replies are saved with body: Replied to your story "LABEL": MESSAGE
// The story_id is stored in the swap_id column so we can fetch the thumbnail
function parseStoryReply(body: string): { label: string; reply: string } | null {
    if (!body) return null
    // Match: Replied to your story "ANYTHING": REPLY TEXT
    const match = body.match(/^Replied to your story "(.*?)": (.+)$/s)
    if (!match) return null
    return { label: match[1] || 'Story', reply: match[2] }
}

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending', accepted: 'Accepted', otp_pending: 'OTP Required',
    declined: 'Declined', cancelled: 'Cancelled', swapped: 'Swapped',
}
const STATUS_COLORS: Record<string, string> = {
    pending: '#d97706', accepted: '#16a34a', otp_pending: '#854d0e',
    declined: '#dc2626', cancelled: '#888', swapped: '#0369a1',
}
const STATUS_BG: Record<string, string> = {
    pending: '#fff8e7', accepted: '#f0fdf4', otp_pending: '#fef9c3',
    declined: '#fef2f2', cancelled: '#f5f5f5', swapped: '#e0f2fe',
}

// ── DRAGGABLE LOCAL PIP ────────────────────────────────────────
function DraggablePip({ localStream, isFrontCam, isCamOff }: any) {
    const pan = useRef({ x: 0, y: 0 })
    const [pos, setPos] = useState({ x: 0, y: 0 })
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder:  () => true,
            onPanResponderGrant: () => { pan.current = { ...pos } },
            onPanResponderMove: (_, gs) => { setPos({ x: pan.current.x + gs.dx, y: pan.current.y + gs.dy }) },
            onPanResponderRelease: (_, gs) => { pan.current = { x: pan.current.x + gs.dx, y: pan.current.y + gs.dy } },
        })
    ).current
    if (!localStream) return null
    return (
        <View style={[vcS.localWrap, { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]} {...panResponder.panHandlers}>
            {isCamOff
                ? <View style={vcS.localCamOff}><Ionicons name="videocam-off" size={20} color="rgba(255,255,255,0.7)" /></View>
                : <RTCView streamURL={localStream.toURL()} style={vcS.localVideo} objectFit="cover" mirror={isFrontCam} zOrder={2} />
            }
        </View>
    )
}

// ── VIDEO CALL SCREEN ──────────────────────────────────────────
function VideoCallScreen({
    visible, partnerName, partnerAvatar,
    onAccept, onDecline, onEnd,
    localStream, remoteStream,
    isMuted, isCamOff, isFrontCam,
    onToggleMic, onToggleCam, onFlipCamera,
    callState
}: any) {
    if (!visible) return null
    const safeAvatar = partnerAvatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(partnerName || 'U')}&background=4A635D&color=fff&size=200`
    const hasRemote = !!remoteStream
    return (
        <Modal visible={visible} animationType="fade" statusBarTranslucent>
            <View style={vcS.container}>
                {/*
                  FIX 1: RTCView is ALWAYS rendered — never conditionally mounted/unmounted.
                  Unmounting RTCView causes a black screen on Android.
                  FIX 2: key={remoteStream?.id} forces a clean remount only when the stream
                  object actually changes, avoiding stale stream binding.
                  FIX 3: zOrder={1} renders ABOVE React Native UI layers on Android.
                  zOrder={0} (default) renders BELOW RN views = black screen.
                */}
                <RTCView
                    key={remoteStream?.id ?? 'no-stream'}
                    streamURL={hasRemote ? remoteStream.toURL() : ''}
                    style={vcS.remoteVideo}
                    objectFit="cover"
                    mirror={false}
                    zOrder={1}
                />

                {/* Connecting overlay — shown on top when remote stream not yet arrived */}
                {!hasRemote && (
                    <View style={vcS.connecting}>
                        <Image source={{ uri: safeAvatar }} style={vcS.connectingAvatar} />
                        <Text style={vcS.connectingName}>{partnerName || '...'}</Text>
                        <Text style={vcS.connectingStatus}>
                            {callState === 'incoming' ? 'Incoming Video Call'
                                : callState === 'calling' ? 'Calling…' : 'Connecting…'}
                        </Text>
                        {(callState === 'calling' || callState === 'connected') && (
                            <View style={vcS.dotsRow}>
                                <View style={vcS.dot} /><View style={vcS.dot} /><View style={vcS.dot} />
                            </View>
                        )}
                    </View>
                )}
                {localStream && (callState === 'calling' || callState === 'connected' || callState === 'active') && (
                    <DraggablePip localStream={localStream} isFrontCam={isFrontCam} isCamOff={isCamOff} />
                )}
                <View style={vcS.header}>
                    <Text style={vcS.headerName}>{partnerName || '...'}</Text>
                    {callState === 'active'    && <Text style={vcS.headerStatus}>● Connected</Text>}
                    {callState === 'connected' && <Text style={vcS.headerStatus}>Connecting…</Text>}
                    {callState === 'calling'   && <Text style={vcS.headerStatus}>Calling…</Text>}
                </View>
                {callState === 'incoming' && (
                    <View style={vcS.incomingBtns}>
                        <View style={vcS.callBtnWrap}>
                            <TouchableOpacity style={vcS.declineBtn} onPress={onDecline}>
                                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                            </TouchableOpacity>
                            <Text style={vcS.callBtnLabel}>Decline</Text>
                        </View>
                        <View style={vcS.callBtnWrap}>
                            <TouchableOpacity style={vcS.acceptBtn} onPress={onAccept}>
                                <Ionicons name="call" size={28} color="#fff" />
                            </TouchableOpacity>
                            <Text style={vcS.callBtnLabel}>Accept</Text>
                        </View>
                    </View>
                )}
                {callState === 'calling' && (
                    <View style={vcS.controlsRow}>
                        <View style={vcS.callBtnWrap}>
                            <TouchableOpacity style={vcS.endBtn} onPress={onEnd}>
                                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                            </TouchableOpacity>
                            <Text style={vcS.callBtnLabel}>Cancel</Text>
                        </View>
                    </View>
                )}
                {(callState === 'active' || callState === 'connected') && (
                    <View style={vcS.controlsRow}>
                        <View style={vcS.callBtnWrap}>
                            <TouchableOpacity style={[vcS.ctrlBtn, isMuted && vcS.ctrlBtnActive]} onPress={onToggleMic}>
                                <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color="#fff" />
                            </TouchableOpacity>
                            <Text style={vcS.callBtnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
                        </View>
                        <View style={vcS.callBtnWrap}>
                            <TouchableOpacity style={vcS.endBtn} onPress={onEnd}>
                                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                            </TouchableOpacity>
                            <Text style={vcS.callBtnLabel}>End</Text>
                        </View>
                        <View style={vcS.callBtnWrap}>
                            <TouchableOpacity style={[vcS.ctrlBtn, isCamOff && vcS.ctrlBtnActive]} onPress={onToggleCam}>
                                <Ionicons name={isCamOff ? 'videocam-off' : 'videocam'} size={22} color="#fff" />
                            </TouchableOpacity>
                            <Text style={vcS.callBtnLabel}>{isCamOff ? 'Show' : 'Hide'}</Text>
                        </View>
                        <View style={vcS.callBtnWrap}>
                            <TouchableOpacity style={vcS.ctrlBtn} onPress={onFlipCamera}>
                                <Ionicons name="camera-reverse" size={22} color="#fff" />
                            </TouchableOpacity>
                            <Text style={vcS.callBtnLabel}>Flip</Text>
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    )
}

const vcS = StyleSheet.create({
    container:        { flex: 1, backgroundColor: '#111' },
    remoteVideo:      { ...StyleSheet.absoluteFillObject, zIndex: 0 },
    connecting:       { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: GREEN, gap: 12, zIndex: 2 },
    connectingAvatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
    connectingName:   { fontSize: 22, fontWeight: '700', color: '#fff' },
    connectingStatus: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
    dotsRow:          { flexDirection: 'row', gap: 6, marginTop: 4 },
    dot:              { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)' },
    localWrap:        { position: 'absolute', top: 80, right: 16, width: 100, height: 140, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: '#222', zIndex: 3 },
    localVideo:       { width: '100%', height: '100%' },
    localCamOff:      { width: '100%', height: '100%', backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
    header:           { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 4 },
    headerName:       { fontSize: 18, fontWeight: '700', color: '#fff' },
    headerStatus:     { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    incomingBtns:     { position: 'absolute', bottom: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 60, zIndex: 5 },
    controlsRow:      { position: 'absolute', bottom: 48, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20, zIndex: 5 },
    callBtnWrap:      { alignItems: 'center', gap: 8 },
    callBtnLabel:     { color: '#fff', fontSize: 12, fontWeight: '600' },
    acceptBtn:        { width: 68, height: 68, borderRadius: 34, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center', shadowColor: '#22c55e', shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 },
    declineBtn:       { width: 68, height: 68, borderRadius: 34, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', shadowColor: '#ef4444', shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 },
    endBtn:           { width: 68, height: 68, borderRadius: 34, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', shadowColor: '#ef4444', shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 },
    ctrlBtn:          { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    ctrlBtnActive:    { backgroundColor: 'rgba(239,68,68,0.7)' },
})

// ── OTP MODAL ──────────────────────────────────────────────────
function OtpModal({ visible, swapId, currentUserId, partnerId, onClose, onSuccess }: any) {
    const [myCode, setMyCode]   = useState('')
    const [inputs, setInputs]   = useState(['', '', '', ''])
    const [loading, setLoading] = useState(false)
    const [done, setDone]       = useState(false)
    const inputRefs             = useRef<any[]>([])

    useEffect(() => { if (visible && swapId) loadOtp() }, [visible, swapId])

    async function loadOtp() {
        setDone(false); setInputs(['', '', '', ''])
        const { data: swapRow } = await supabase.from('swaps')
            .select('otp_requester, otp_owner, requester_id, owner_id, status').eq('id', swapId).single()
        if (!swapRow) return
        const amReq = swapRow.requester_id === currentUserId
        const myField = amReq ? 'otp_requester' : 'otp_owner'
        let code = swapRow[myField]
        if (!code) { code = gen4(); await supabase.from('swaps').update({ [myField]: code, status: 'otp_pending' }).eq('id', swapId) }
        setMyCode(code)
    }

    async function verify() {
        const entered = inputs.join('')
        if (entered.length < 4) return
        setLoading(true)
        const { data: swapRow } = await supabase.from('swaps')
            .select('otp_requester, otp_owner, requester_id, owner_id, offered_pts').eq('id', swapId).single()
        if (!swapRow) { setLoading(false); return }
        const amReq = swapRow.requester_id === currentUserId
        const partnerCode = amReq ? swapRow.otp_owner : swapRow.otp_requester
        if (!partnerCode) { Alert.alert('Not yet', "Partner hasn't generated their code yet."); setLoading(false); return }
        if (entered !== partnerCode) { Alert.alert('Wrong Code', 'Check with your swap partner and try again.'); setLoading(false); return }
        await supabase.from('swaps').update({ status: 'swapped' }).eq('id', swapId)
        const { data: swapFull } = await supabase.from('swaps').select('requested_item_id, offered_item_id').eq('id', swapId).single()
        if (swapFull) {
            await supabase.from('items').update({ status: 'swapped' }).eq('id', swapFull.requested_item_id)
            if (swapFull.offered_item_id) await supabase.from('items').update({ status: 'swapped' }).eq('id', swapFull.offered_item_id)
        }
        if (partnerId) await supabase.from('messages').insert({
            from_user_id: currentUserId, to_user_id: partnerId,
            body: 'Swap confirmed! Both codes matched. Items are now marked as swapped.',
            msg_type: 'swap_swapped', swap_id: swapId, read: false
        })
        setLoading(false); setDone(true); onSuccess()
    }

    function setDigit(idx: number, val: string) {
        const digit = val.replace(/\D/g, '').slice(-1)
        const next = [...inputs]; next[idx] = digit; setInputs(next)
        if (digit && idx < 3) inputRefs.current[idx + 1]?.focus()
    }

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={otpS.overlay}>
                <View style={otpS.box}>
                    {!done ? (
                        <>
                            <View style={otpS.iconCircle}><Ionicons name="lock-closed" size={28} color={GREEN} /></View>
                            <Text style={otpS.title}>Confirm Your Swap</Text>
                            <Text style={otpS.sub}>Share your code with the other swapper, then enter theirs below.</Text>
                            <View style={otpS.myCodeBox}>
                                <Text style={otpS.myCodeLabel}>Your confirmation code</Text>
                                <Text style={otpS.myCodeVal}>{myCode || '—'}</Text>
                                <TouchableOpacity style={otpS.copyBtn} onPress={() => Alert.alert('Your Code', `Your OTP is: ${myCode}`)}>
                                    <Ionicons name="copy-outline" size={13} color="rgba(255,255,255,0.8)" />
                                    <Text style={otpS.copyBtnText}>Copy Code</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={otpS.enterLabel}>Enter their code</Text>
                            <View style={otpS.inputs}>
                                {inputs.map((d, i) => (
                                    <TextInput key={i} ref={r => { inputRefs.current[i] = r }}
                                        style={[otpS.digitInput, d ? otpS.digitFilled : undefined]}
                                        value={d} onChangeText={v => setDigit(i, v)} keyboardType="numeric" maxLength={1}
                                        onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Backspace' && !d && i > 0) inputRefs.current[i - 1]?.focus() }}
                                    />
                                ))}
                            </View>
                            <TouchableOpacity style={[otpS.verifyBtn, (inputs.join('').length < 4 || loading) ? otpS.btnDisabled : undefined]}
                                onPress={verify} disabled={inputs.join('').length < 4 || loading}>
                                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={otpS.verifyBtnText}>Verify & Complete Swap</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose} style={otpS.cancelBtn}><Text style={otpS.cancelBtnText}>Cancel</Text></TouchableOpacity>
                        </>
                    ) : (
                        <View style={otpS.successBox}>
                            <Ionicons name="checkmark-circle" size={56} color="#16a34a" style={{ marginBottom: 8 }} />
                            <Text style={otpS.successTitle}>Swap Complete!</Text>
                            <Text style={otpS.successSub}>The items have been marked as swapped.</Text>
                            <TouchableOpacity style={[otpS.verifyBtn, { marginTop: 16 }]} onPress={onClose}><Text style={otpS.verifyBtnText}>Done ✦</Text></TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    )
}

const otpS = StyleSheet.create({
    overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    box:           { backgroundColor: '#fff', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center' },
    iconCircle:    { width: 60, height: 60, borderRadius: 30, backgroundColor: '#f0fdf8', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    title:         { fontSize: 20, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 8 },
    sub:           { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
    myCodeBox:     { width: '100%', backgroundColor: GREEN, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 20 },
    myCodeLabel:   { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
    myCodeVal:     { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: 10, marginBottom: 10 },
    copyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
    copyBtnText:   { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
    enterLabel:    { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
    inputs:        { flexDirection: 'row', gap: 10, marginBottom: 20 },
    digitInput:    { width: 52, height: 60, borderWidth: 2, borderColor: '#eee', borderRadius: 14, textAlign: 'center', fontSize: 24, fontWeight: '700', color: GREEN },
    digitFilled:   { borderColor: ROSE, backgroundColor: '#faf4f6' },
    verifyBtn:     { width: '100%', backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
    btnDisabled:   { opacity: 0.4 },
    verifyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    cancelBtn:     { paddingVertical: 8 },
    cancelBtnText: { fontSize: 13, color: '#aaa' },
    successBox:    { alignItems: 'center', width: '100%' },
    successTitle:  { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
    successSub:    { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 4 },
})

// ── SWAP CARD ──────────────────────────────────────────────────
function SwapCard({ swap, currentUserId, onAction }: any) {
    const isOwner = swap.owner_id === currentUserId
    const ri = swap.ri?.images?.[0] || FALLBACK; const oi = swap.oi?.images?.[0] || FALLBACK
    const rn = swap.ri?.name || 'Item'
    const on = swap.offered_item_id ? (swap.oi?.name || 'Item') : (swap.offered_pts > 0 ? `${swap.offered_pts.toLocaleString()} pts` : '?')
    const color = STATUS_COLORS[swap.status] || '#888'; const bg = STATUS_BG[swap.status] || '#f5f5f5'
    const label = STATUS_LABELS[swap.status] || swap.status
    return (
        <View style={scS.card}>
            <View style={scS.header}><Ionicons name="swap-horizontal" size={13} color={GREEN} /><Text style={scS.headerText}>Swap Request</Text></View>
            <View style={scS.items}>
                <View style={scS.itemSide}>
                    {swap.offered_item_id ? <Image source={{ uri: oi }} style={scS.img} resizeMode="cover" /> : <View style={[scS.img, scS.ptsImg]}><Ionicons name="cash-outline" size={24} color={GREEN} /></View>}
                    <Text style={scS.itemName} numberOfLines={2}>{on}</Text><Text style={scS.itemSub}>{isOwner ? 'Their offer' : 'Your offer'}</Text>
                </View>
                <View style={scS.arrow}><Ionicons name="swap-horizontal" size={22} color={ROSE} /></View>
                <View style={scS.itemSide}>
                    <Image source={{ uri: ri }} style={scS.img} resizeMode="cover" />
                    <Text style={scS.itemName} numberOfLines={2}>{rn}</Text><Text style={scS.itemSub}>{isOwner ? 'Your item' : 'Their item'}</Text>
                </View>
            </View>
            {swap.offered_pts > 0 && <View style={scS.ptsPill}><Ionicons name="add-circle" size={12} color="#16a34a" /><Text style={scS.ptsPillText}>+{swap.offered_pts.toLocaleString()} pts included</Text></View>}
            <View style={scS.statusRow}><View style={[scS.badge, { backgroundColor: bg }]}><Text style={[scS.badgeText, { color }]}>{label}</Text></View></View>
            {swap.status === 'pending' && isOwner && (
                <View style={scS.actions}>
                    <TouchableOpacity style={scS.acceptBtn} onPress={() => onAction(swap.id, 'accepted')}><Ionicons name="checkmark" size={14} color="#fff" /><Text style={scS.acceptText}>Accept</Text></TouchableOpacity>
                    <TouchableOpacity style={scS.declineBtn} onPress={() => onAction(swap.id, 'declined')}><Ionicons name="close" size={14} color="#dc2626" /><Text style={scS.declineText}>Decline</Text></TouchableOpacity>
                </View>
            )}
            {swap.status === 'pending' && !isOwner && <TouchableOpacity style={scS.cancelBtn} onPress={() => onAction(swap.id, 'cancelled')}><Ionicons name="close-circle-outline" size={14} color="#888" /><Text style={scS.cancelText}>Cancel Request</Text></TouchableOpacity>}
            {(swap.status === 'accepted' || swap.status === 'otp_pending') && <TouchableOpacity style={scS.otpBtn} onPress={() => onAction(swap.id, 'otp')}><Ionicons name="lock-closed-outline" size={14} color="#fff" /><Text style={scS.otpText}>Enter OTP to Complete</Text></TouchableOpacity>}
            {swap.status === 'swapped' && <View style={scS.swappedRow}><Ionicons name="checkmark-done-circle-outline" size={15} color="#0369a1" /><Text style={scS.swappedText}>Swap completed</Text></View>}
        </View>
    )
}

const scS = StyleSheet.create({
    card:        { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: '#f0eded', width: 300 },
    header:      { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14, paddingBottom: 10, backgroundColor: '#faf4f6', borderBottomWidth: 1, borderBottomColor: '#f0dfe5' },
    headerText:  { fontSize: 12, fontWeight: '700', color: GREEN },
    items:       { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
    itemSide:    { flex: 1, alignItems: 'center', gap: 6 },
    arrow:       { width: 32, alignItems: 'center' },
    img:         { width: '100%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: '#eee' },
    ptsImg:      { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4' },
    itemName:    { fontSize: 12, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', lineHeight: 16 },
    itemSub:     { fontSize: 11, color: '#aaa' },
    ptsPill:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f0fdf4', paddingHorizontal: 14, paddingVertical: 6, marginHorizontal: 14, marginBottom: 10, borderRadius: 50 },
    ptsPillText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
    statusRow:   { paddingHorizontal: 14, paddingBottom: 10 },
    badge:       { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 50 },
    badgeText:   { fontSize: 12, fontWeight: '800' },
    actions:     { flexDirection: 'row', gap: 10, padding: 14, paddingTop: 4 },
    acceptBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 12 },
    acceptText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
    declineBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1.5, borderColor: '#fecaca', borderRadius: 12, paddingVertical: 12 },
    declineText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
    cancelBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 14, marginTop: 0, borderWidth: 1.5, borderColor: '#eee', borderRadius: 12, paddingVertical: 12 },
    cancelText:  { color: '#888', fontWeight: '700', fontSize: 14 },
    otpBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 14, marginTop: 4, backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 12 },
    otpText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
    swappedRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, paddingTop: 0 },
    swappedText: { fontSize: 14, fontWeight: '700', color: '#0369a1' },
})

// ── CHANGE 3: Story Reply Bubble — Facebook/Instagram style preview ──
function StoryReplyBubble({ msg, partnerAvatar, isMe, storyImageUrl, partnerName }: {
    msg: any; partnerAvatar: string; isMe: boolean
    storyImageUrl?: string; partnerName: string
}) {
    const parsed = parseStoryReply(msg.body)
    if (!parsed) return null
    const contextLine = isMe
        ? `You replied to ${partnerName}'s story`
        : `${partnerName} replied to your story`
    const hasImage = !!storyImageUrl
    return (
        <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
            {!isMe && <Image source={{ uri: partnerAvatar }} style={styles.msgAvatar} />}
            <View style={srS.wrap}>
                {/* Context line — "You replied to X's story" */}
                <Text style={[srS.contextLine, isMe && srS.contextLineMe]}>
                    ↩ {contextLine}
                </Text>
                {/* Story thumbnail */}
                <View style={[srS.preview, isMe && srS.previewMe]}>
                    {hasImage
                        ? <Image source={{ uri: storyImageUrl }} style={srS.previewImg} resizeMode="cover" />
                        : (
                            // Story no longer available (no swap_id on old messages, or story expired)
                            <View style={srS.previewExpired}>
                                <Ionicons name="time-outline" size={22} color="rgba(255,255,255,0.5)" />
                                <Text style={srS.previewExpiredTxt}>Story unavailable</Text>
                            </View>
                        )
                    }
                </View>
                {/* Reply text bubble */}
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, srS.replyBubble]}>
                    <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{parsed.reply}</Text>
                    <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
                        {timeAgo(msg.created_at)}{isMe ? (msg._optimistic ? ' · ...' : msg.read ? ' · Read' : ' · Sent') : ''}
                    </Text>
                </View>
            </View>
        </View>
    )
}

const srS = StyleSheet.create({
    wrap:            { maxWidth: '75%' },
    contextLine:     { fontSize: 11, color: '#aaa', marginBottom: 5, paddingHorizontal: 2 },
    contextLineMe:   { textAlign: 'right' },
    preview:         { width: 180, height: 110, borderRadius: 14, borderBottomLeftRadius: 4, overflow: 'hidden' },
    previewMe:       { borderBottomLeftRadius: 14, borderBottomRightRadius: 4, alignSelf: 'flex-end' },
    previewImg:      { width: '100%', height: '100%' },
    previewExpired:  { width: '100%', height: '100%', backgroundColor: '#d8d0d5', alignItems: 'center', justifyContent: 'center', gap: 4 },
    previewExpiredTxt:{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
    replyBubble:     { borderTopLeftRadius: 4, borderTopRightRadius: 4, marginTop: 2 },
})

// ══════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════
export default function MessagesScreen() {
    const router = useRouter()
    // CHANGE 4: read ?with= param — profile Message button passes this to auto-open the right convo
    const { with: withUserId } = useLocalSearchParams<{ with?: string }>()

    const [currentUser, setCurrentUser]     = useState<any>(null)
    const [activeTab, setActiveTab]         = useState<'msgs' | 'swaps'>('msgs')
    const [conversations, setConversations] = useState<any[]>([])
    const [allSwaps, setAllSwaps]           = useState<any[]>([])
    const [loading, setLoading]             = useState(true)
    const [selectedConvo, setSelectedConvo] = useState<any>(null)
    const [messages, setMessages]           = useState<any[]>([])
    const [msgLoading, setMsgLoading]       = useState(false)
    const [newMsg, setNewMsg]               = useState('')
    const [sending, setSending]             = useState(false)
    const [swapMap, setSwapMap]             = useState<Record<string, any>>({})
    const [otpSwapId, setOtpSwapId]         = useState<string | null>(null)
    const [showOtp, setShowOtp]             = useState(false)
    const flatRef           = useRef<FlatList>(null)
    const flipInProgressRef = useRef(false)
    // CHANGE 5: cache story images for reply preview thumbnails
    const storyImgCache = useRef<Record<string, string>>({})

    const [callVisible, setCallVisible]             = useState(false)
    const [callState, setCallState]                 = useState<'idle'|'calling'|'incoming'|'connected'|'active'>('idle')
    const [localStream, setLocalStream]             = useState<any>(null)
    const [remoteStream, setRemoteStream]           = useState<any>(null)
    const [isMuted, setIsMuted]                     = useState(false)
    const [isCamOff, setIsCamOff]                   = useState(false)
    const [isFrontCam, setIsFrontCam]               = useState(true)
    const [callPartnerId, setCallPartnerId]         = useState<string | null>(null)
    const [callPartnerName, setCallPartnerName]     = useState('')
    const [callPartnerAvatar, setCallPartnerAvatar] = useState('')

    const peerRef              = useRef<any>(null)
    const myChannelRef         = useRef<any>(null)
    const partnerChannelRef    = useRef<any>(null)
    const iceBufRef            = useRef<any[]>([])
    const outboundIceBufRef    = useRef<any[]>([])
    const offerBufRef          = useRef<any>(null)
    const callPartnerIdRef     = useRef<string | null>(null)
    const answerSentRef        = useRef(false)
    const acceptingRef         = useRef(false)

    useEffect(() => { boot() }, [])

    // CHANGE 6: boot() now uses the returned convos to auto-open when ?with= is present
    async function boot() {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.replace('/login' as any); return }
        setCurrentUser(session.user)
        const convos = await loadConversations(session.user.id)
        await loadAllSwaps(session.user.id)
        subscribeToCallSignals(session.user.id)
        setLoading(false)

        // Auto-open conversation when navigated here from a profile's Message button
        if (withUserId) {
            const uid = session.user.id
            const existing = (convos || []).find((c: any) => c.partnerId === withUserId)
            if (existing) {
                openConversation(existing, uid)
            } else {
                const { data: partnerProf } = await supabase
                    .from('profiles')
                    .select('id, display_name, username, avatar_url')
                    .eq('id', withUserId)
                    .single()
                if (partnerProf) {
                    openConversation({
                        partnerId: withUserId,
                        partner:   partnerProf,
                        lastMsg:   null,
                        unread:    0,
                        item:      null,
                    }, uid)
                }
            }
        }
    }

    function subscribeToCallSignals(uid: string) {
        // Don't re-subscribe if already listening
        if (myChannelRef.current) {
            console.log('[CALL] Already subscribed to call signals, skipping')
            return
        }
        console.log('[CALL] Subscribing to: call-' + uid)
        const ch = supabase.channel(`call-${uid}`, { config: { broadcast: { ack: true } } })
        .on('broadcast', { event: 'incoming_call' }, ({ payload }: any) => {
            console.log('[CALL] incoming_call from:', payload.callerId, 'ts:', payload.ts)
            // Block stale replayed signals — no ts means old signal, always ignore on fresh mount
            const age = payload.ts ? Date.now() - payload.ts : Infinity
            if (age > 15000) {
                console.log('[CALL] Ignoring stale incoming_call (age:', age, 'ms)')
                return
            }
            if (callPartnerIdRef.current) { console.log('[CALL] Already in call, ignore'); return }
            callPartnerIdRef.current  = payload.callerId
            offerBufRef.current       = null
            iceBufRef.current         = []
            outboundIceBufRef.current = []
            peerRef.current           = null
            answerSentRef.current     = false
            acceptingRef.current      = false
            setCallPartnerId(payload.callerId)
            setCallPartnerName(payload.callerName || 'Caller')
            setCallPartnerAvatar(payload.callerAvatar || '')
            setCallState('incoming')
            setCallVisible(true)
        })
        .on('broadcast', { event: 'call_offer' }, async ({ payload }: any) => {
            console.log('[CALL] call_offer — peer:', !!peerRef.current, 'accepting:', acceptingRef.current, 'answered:', answerSentRef.current)
            offerBufRef.current = payload.offer
            if (acceptingRef.current) { console.log('[CALL] acceptCall running — buffered'); return }
            if (answerSentRef.current) { console.log('[CALL] Already answered, skip'); return }
            if (peerRef.current && !peerRef.current.remoteDescription) {
                await processOffer(payload.offer)
            }
        })
        .on('broadcast', { event: 'call_answer' }, async ({ payload }: any) => {
            console.log('[CALL] call_answer — answered:', answerSentRef.current)
            if (answerSentRef.current || peerRef.current?.remoteDescription) {
                console.log('[CALL] Already applied or remote desc set, skip'); return
            }
            if (!peerRef.current) return
            try {
                answerSentRef.current = true
                await peerRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer))
                // Flush any ICE candidates that arrived before we set remote description
                await flushInboundIceCandidates()
                // Flush any outbound ICE that was gathered during offer creation
                await flushOutboundIceCandidates()
                // Don't set 'active' here — wait for onaddstream/ontrack
                setCallState('connected')
                console.log('[CALL] Remote description set on caller — ICE negotiation underway')
            } catch (e) { answerSentRef.current = false; console.error('[CALL] Error applying answer:', e) }
        })
        .on('broadcast', { event: 'ice_candidate' }, async ({ payload }: any) => {
            if (!payload.candidate) return
            if (peerRef.current?.remoteDescription) {
                try { await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
            } else {
                iceBufRef.current.push(payload.candidate)
            }
        })
        .on('broadcast', { event: 'call_ended' },    () => { console.log('[CALL] call_ended'); cleanupCall() })
        .on('broadcast', { event: 'call_declined' },  () => { console.log('[CALL] call_declined'); cleanupCall(); Alert.alert('Call Declined', 'The other person declined your call.') })
        .on('broadcast', { event: 'call_cancelled' }, () => { console.log('[CALL] call_cancelled'); cleanupCall() })
        .on('broadcast', { event: 'cam_state' }, ({ payload }: any) => {
            if (payload.camOff) setRemoteStream(null)
        })
        .subscribe((status: string) => { console.log('[CALL] My channel status:', status) })
        myChannelRef.current = ch
    }

    async function processOffer(offer: any) {
        if (answerSentRef.current)            { console.log('[CALL] processOffer: already sent'); return }
        if (!peerRef.current)                  { console.log('[CALL] processOffer: no peer'); return }
        if (peerRef.current.remoteDescription) { console.log('[CALL] processOffer: remote already set'); return }
        try {
            answerSentRef.current = true
            await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer))
            // Flush any ICE candidates that arrived before remote description
            await flushInboundIceCandidates()
            // Create answer — include receive constraints for cross-platform compat
            const answer = await peerRef.current.createAnswer({
                offerToReceiveVideo: true,
                offerToReceiveAudio: true,
            } as any)
            await peerRef.current.setLocalDescription(answer)
            // Flush ICE candidates that gathered during setLocalDescription
            await flushOutboundIceCandidates()
            if (partnerChannelRef.current) {
                await partnerChannelRef.current.send({
                    type: 'broadcast', event: 'call_answer', payload: { answer }
                }).catch((e: any) => console.warn('[CALL] answer send warn:', e))
                console.log('[CALL] call_answer sent')
            }
        } catch (e) { answerSentRef.current = false; console.error('[CALL] processOffer error:', e); throw e }
    }

    async function flushInboundIceCandidates() {
        const buf = iceBufRef.current.splice(0)
        for (const c of buf) { try { await peerRef.current?.addIceCandidate(new RTCIceCandidate(c)) } catch {} }
    }

    async function flushOutboundIceCandidates() {
        const buf = outboundIceBufRef.current.splice(0)
        console.log('[CALL] Flushing', buf.length, 'buffered outbound ICE candidates')
        for (const c of buf) {
            if (partnerChannelRef.current) {
                await partnerChannelRef.current.send({
                    type: 'broadcast', event: 'ice_candidate', payload: { candidate: c }
                }).catch((e: any) => console.warn('[CALL] buffered ICE send warn:', e))
            }
        }
    }

    async function getLocalStream(frontCam = true) {
        const stream = await mediaDevices.getUserMedia({
            audio: true, video: { facingMode: frontCam ? 'user' : 'environment', width: 640, height: 480 }
        })
        setLocalStream(stream); setIsFrontCam(frontCam); return stream
    }

    async function subscribeToPartnerChannel(partnerId: string) {
        if (partnerChannelRef.current) { supabase.removeChannel(partnerChannelRef.current); partnerChannelRef.current = null }
        const ch = supabase.channel(`call-${partnerId}`, { config: { broadcast: { ack: true } } })
        await new Promise<void>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('timeout')), 8000)
            ch.subscribe((s: string) => {
                if (s === 'SUBSCRIBED') { clearTimeout(t); resolve() }
                if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); reject(new Error(s)) }
            })
        })
        partnerChannelRef.current = ch; return ch
    }

    function setupPeerConnection(uid: string, partnerId: string) {
        if (peerRef.current) { peerRef.current.close(); peerRef.current = null }
        // Force 'relay' so only TURN candidates are used.
        // react-native-webrtc on Android generates mDNS (.local) candidates that
        // show as "undefined" and never connect cross-device. TURN relay bypasses this.
const pc = new RTCPeerConnection(ICE_SERVERS as any)
        peerRef.current = pc

        ;(pc as any).onicecandidate = (e: any) => {
            if (!e.candidate) {
                console.log('[CALL] ICE gathering complete')
                return
            }
            const cand = e.candidate
            console.log(`[CALL] ICE candidate: ${cand.type} ${cand.protocol} ${cand.address || '?'}`)
            const json = e.candidate.toJSON()
            if (partnerChannelRef.current) {
                partnerChannelRef.current.send({
                    type: 'broadcast', event: 'ice_candidate', payload: { candidate: json }
                }).catch((err: any) => console.warn('[CALL] ICE send failed:', err))
            } else {
                outboundIceBufRef.current.push(json)
            }
        }

        // onaddstream — fires in react-native-webrtc when peer uses addStream
        ;(pc as any).onaddstream = (e: any) => {
            console.log('[CALL] ✅ onaddstream fired, stream id:', e.stream?.id, 'tracks:', e.stream?.getTracks?.()?.length)
            if (e.stream) {
                setRemoteStream(e.stream)
                setCallState('active')
            }
        }

        // ontrack — fires when peer uses addTrack (browser WebRTC or newer rn-webrtc)
        const collectedTracks: any[] = []
        ;(pc as any).ontrack = (e: any) => {
            console.log('[CALL] ontrack fired, kind:', e.track?.kind, 'streams:', e.streams?.length)
            if (e.streams?.[0]) {
                setRemoteStream(e.streams[0])
                setCallState('active')
                return
            }
            if (e.track) {
                collectedTracks.push(e.track)
                const ms = new MediaStream(collectedTracks as any)
                setRemoteStream(ms)
                setCallState('active')
            }
        }

        // ICE connection state — most important diagnostic
        let relayFallbackTimer: any = null
        ;(pc as any).oniceconnectionstatechange = () => {
            const iceState = (pc as any).iceConnectionState
            console.log('[CALL] iceConnectionState:', iceState)
            if (iceState === 'checking') {
                // If still checking after 10s, candidates aren't matching — TURN may be failing
                relayFallbackTimer = setTimeout(() => {
                    console.warn('[CALL] ICE stuck in checking for 10s — TURN relay may be failing')
                }, 10000)
           } else if (iceState === 'connected' || iceState === 'completed') {
    setTimeout(() => {
        try {
            const streams = (pc as any).getRemoteStreams?.() || []
            if (streams[0]) { setRemoteStream(streams[0]); setCallState('active'); return }
            const receivers = (pc as any).getReceivers?.() || []
            const tracks = receivers.map((r: any) => r.track).filter(Boolean)
            if (tracks.length > 0) { setRemoteStream(new MediaStream(tracks)); setCallState('active') }
        } catch (e) { console.warn('[CALL] stream recovery:', e) }
    }, 2000)
} else if (iceState === 'failed') {
                if (relayFallbackTimer) { clearTimeout(relayFallbackTimer); relayFallbackTimer = null }
                console.error('[CALL] ICE failed — all candidates exhausted. Check TURN server.')
            }
        }

        // Connection state — grace period on disconnect, cleanup on failed
        let failTimer: any = null
        ;(pc as any).onconnectionstatechange = () => {
            const state = (pc as any).connectionState
            console.log('[CALL] connectionState:', state)
            if (state === 'disconnected') {
                failTimer = setTimeout(() => {
                    if ((peerRef.current as any)?.connectionState !== 'connected') cleanupCall()
                }, 8000)
            } else if (state === 'connected') {
                if (failTimer) { clearTimeout(failTimer); failTimer = null }
            } else if (state === 'failed') {
                if (failTimer) clearTimeout(failTimer)
                cleanupCall()
            }
        }

        return pc
    }

    function addStreamToPeer(pc: any, stream: any) {
        // Always prefer addStream in react-native-webrtc — most reliable
        if (typeof (pc as any).addStream === 'function') {
            try {
                (pc as any).addStream(stream)
                console.log('[CALL] addStream OK, tracks:', stream.getTracks().length)
                return
            } catch (e) { console.warn('[CALL] addStream threw, falling back to addTrack:', e) }
        }
        try {
            stream.getTracks().forEach((track: any) => (pc as any).addTrack(track, stream))
            console.log('[CALL] addTrack OK, tracks:', stream.getTracks().length)
        } catch (e) { console.error('[CALL] addTrack also failed:', e) }
    }

    async function startVideoCall(partnerId: string, partnerName: string, partnerAvatar: string) {
        if (!currentUser) return
        console.log('[CALL] Starting call to:', partnerId)
        callPartnerIdRef.current  = partnerId
        answerSentRef.current     = false
        acceptingRef.current      = false
        outboundIceBufRef.current = []
        setCallPartnerId(partnerId); setCallPartnerName(partnerName); setCallPartnerAvatar(partnerAvatar)
        setCallState('calling'); setCallVisible(true)
        iceBufRef.current = []; offerBufRef.current = null
        try {
            const stream = await getLocalStream(true)
            const pc     = setupPeerConnection(currentUser.id, partnerId)
            // IMPORTANT: add stream BEFORE createOffer so tracks are in the SDP
            addStreamToPeer(pc, stream)
            const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
            await pc.setLocalDescription(offer)
            // Subscribe to partner channel FIRST, then send signals
            await subscribeToPartnerChannel(partnerId)
            await flushOutboundIceCandidates()
            // Notify callee they're getting a call
            await partnerChannelRef.current.send({
                type: 'broadcast', event: 'incoming_call',
                payload: { callerId: currentUser.id, callerName: partnerName, callerAvatar: partnerAvatar, ts: Date.now() }
            }).catch((e: any) => console.warn('[CALL] incoming_call warn:', e))
            console.log('[CALL] incoming_call sent')
            // Small delay to let callee set up their peer connection before offer arrives
            await new Promise(r => setTimeout(r, 800))
            await partnerChannelRef.current.send({
                type: 'broadcast', event: 'call_offer', payload: { offer }
            }).catch((e: any) => console.warn('[CALL] call_offer warn:', e))
            console.log('[CALL] call_offer sent')
        } catch (e) {
            console.error('[CALL] startVideoCall error:', e)
            cleanupCall()
            Alert.alert('Call Failed', 'Could not start the call. Please try again.')
        }
    }

    async function acceptCall() {
        const partnerId = callPartnerIdRef.current
        if (!currentUser || !partnerId) return
        console.log('[CALL] Accepting call from:', partnerId)
        acceptingRef.current      = true
        answerSentRef.current     = false
        iceBufRef.current         = []
        outboundIceBufRef.current = []
        setCallState('connected')
        try {
            const stream = await getLocalStream(true)
            const pc     = setupPeerConnection(currentUser.id, partnerId)
            // Add stream before processing offer so tracks are ready
            addStreamToPeer(pc, stream)
            await subscribeToPartnerChannel(partnerId)
            await flushOutboundIceCandidates()
            const offer = offerBufRef.current
            if (offer) {
                console.log('[CALL] Processing buffered offer in acceptCall')
                offerBufRef.current  = null
                acceptingRef.current = false  // release before processOffer (it sets its own guard)
                await processOffer(offer)
            } else {
                console.log('[CALL] No offer buffered — will process when call_offer arrives')
                acceptingRef.current = false
            }
        } catch (e) {
            console.error('[CALL] acceptCall error:', e)
            acceptingRef.current = false
            cleanupCall()
        }
    }

    async function declineCall() {
        const partnerId = callPartnerIdRef.current
        if (partnerId) {
            try {
                await subscribeToPartnerChannel(partnerId)
                await partnerChannelRef.current.send({ type: 'broadcast', event: 'call_declined', payload: {} })
                    .catch((e: any) => console.warn('[CALL] decline warn:', e))
            } catch {}
        }
        cleanupCall()
    }

    async function endCall() {
        if (partnerChannelRef.current) {
            try {
                await partnerChannelRef.current.send({ type: 'broadcast', event: 'call_ended', payload: {} })
                    .catch((e: any) => console.warn('[CALL] end warn:', e))
            } catch {}
        }
        cleanupCall()
    }

    function cleanupCall() {
        console.log('[CALL] Cleaning up')
        localStream?.getTracks?.().forEach((t: any) => t.stop())
        peerRef.current?.close()
        peerRef.current           = null
        offerBufRef.current       = null
        iceBufRef.current         = []
        outboundIceBufRef.current = []
        answerSentRef.current     = false
        acceptingRef.current      = false
        callPartnerIdRef.current  = null
        if (partnerChannelRef.current) { supabase.removeChannel(partnerChannelRef.current); partnerChannelRef.current = null }
        setLocalStream(null); setRemoteStream(null); setCallState('idle')
        setCallVisible(false); setCallPartnerId(null); setIsMuted(false); setIsCamOff(false)
    }

    function toggleMic() {
        if (!localStream) return
        localStream.getAudioTracks().forEach((t: any) => { t.enabled = !t.enabled })
        setIsMuted(prev => !prev)
    }

    async function toggleCam() {
        if (!localStream) return
        const newCamOff = !isCamOff
        localStream.getVideoTracks().forEach((t: any) => { t.enabled = !newCamOff })
        setIsCamOff(newCamOff)
        if (partnerChannelRef.current) {
            await partnerChannelRef.current.send({ type: 'broadcast', event: 'cam_state', payload: { camOff: newCamOff } }).catch(() => {})
        }
    }

    async function flipCamera() {
        if (!localStream || flipInProgressRef.current) return
        flipInProgressRef.current = true
        try {
            const videoTrack = localStream.getVideoTracks()[0]
            if (videoTrack) { await (videoTrack as any)._switchCamera(); setIsFrontCam(prev => !prev) }
        } catch (e) { console.warn('[CALL] Flip error:', e) }
        finally { setTimeout(() => { flipInProgressRef.current = false }, 1000) }
    }

    // CHANGE 7: loadConversations now RETURNS the array so boot() can use it for auto-open
    async function loadConversations(uid: string) {
        try {
            const [sentRes, recvRes] = await Promise.all([
                supabase.from('messages').select('id, from_user_id, to_user_id, body, read, created_at, msg_type, swap_id, item_id, items(id, name, images, pts)').eq('from_user_id', uid).order('created_at', { ascending: false }).limit(200),
                supabase.from('messages').select('id, from_user_id, to_user_id, body, read, created_at, msg_type, swap_id, item_id, items(id, name, images, pts)').eq('to_user_id', uid).order('created_at', { ascending: false }).limit(200)
            ])
            const allMsgs = [...(sentRes.data || []), ...(recvRes.data || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            if (!allMsgs.length) { setConversations([]); return [] }
            const convoMap = new Map<string, any>()
            for (const msg of allMsgs) {
                const partnerId = msg.from_user_id === uid ? msg.to_user_id : msg.from_user_id
                if (!convoMap.has(partnerId)) {
                    convoMap.set(partnerId, { partnerId, lastMsg: msg, unread: (!msg.read && msg.to_user_id === uid) ? 1 : 0, item: msg.items })
                } else if (!msg.read && msg.to_user_id === uid) { convoMap.get(partnerId).unread++ }
            }
            const partnerIds = Array.from(convoMap.keys())
            if (!partnerIds.length) { setConversations([]); return [] }
            const { data: profiles } = await supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', partnerIds)
            const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
            const convos = Array.from(convoMap.values()).map(c => ({
                ...c, partner: profileMap.get(c.partnerId) || { id: c.partnerId, username: 'user', display_name: 'User', avatar_url: null }
            }))
            setConversations(convos)
            return convos   // ← returned for auto-open in boot()
        } catch (e) { console.error('loadConversations ERROR:', e); return [] }
    }

    async function loadAllSwaps(uid: string) {
        try {
            const { data, error } = await supabase.from('swaps')
                .select(`*, ri:items!requested_item_id(id,name,images,pts,category), oi:items!offered_item_id(id,name,images,pts,category), requester:profiles!requester_id(id,username,display_name,avatar_url), owner:profiles!owner_id(id,username,display_name,avatar_url)`)
                .or(`requester_id.eq.${uid},owner_id.eq.${uid}`).order('created_at', { ascending: false })
            if (error) console.error('loadAllSwaps error:', error.message)
            setAllSwaps(data || [])
        } catch (e) { console.error('loadAllSwaps ERROR:', e) }
    }

    async function openConversation(convo: any, overrideUid?: string) {
        setSelectedConvo(convo); setMsgLoading(true); setMessages([])
        // Use overrideUid if passed (e.g. from boot() before state is set), fallback to state
        const uid = overrideUid || currentUser?.id
        if (!uid) {
            // Last resort — fetch from session directly
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) { setMsgLoading(false); return }
            return openConversation(convo, session.user.id)
        }
        try {
            const [sentRes, recvRes] = await Promise.all([
                supabase.from('messages').select('*').eq('from_user_id', uid).eq('to_user_id', convo.partnerId).order('created_at', { ascending: true }),
                supabase.from('messages').select('*').eq('from_user_id', convo.partnerId).eq('to_user_id', uid).order('created_at', { ascending: true })
            ])
            const allMsgs = [...(sentRes.data || []), ...(recvRes.data || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

            // Swap IDs — only real swap messages (have swap_id but are NOT story replies)
            const swapIds = [...new Set(
                allMsgs.filter(m => m.swap_id && !parseStoryReply(m.body)).map(m => m.swap_id)
            )] as string[]
            const newSwapMap: Record<string, any> = {}
            if (swapIds.length) {
                const { data: swaps } = await supabase.from('swaps')
                    .select('*, ri:items!requested_item_id(id,name,images,pts), oi:items!offered_item_id(id,name,images,pts)')
                    .in('id', swapIds)
                swaps?.forEach(s => { newSwapMap[s.id] = s })
            }

            // Story reply thumbnail — look up most recent stories from each partner
            // We match by label since swap_id isn't stored on these messages
            const storyReplyMsgs = allMsgs.filter(m => parseStoryReply(m.body))
            if (storyReplyMsgs.length && !storyImgCache.current[convo.partnerId]) {
                const { data: partnerStories } = await supabase
                    .from('stories')
                    .select('id, image_url, label')
                    .eq('user_id', convo.partnerId)
                    .order('created_at', { ascending: false })
                    .limit(20)
                if (partnerStories?.length) {
                    // Cache by label so we can match against parsed.label
                    partnerStories.forEach((s: any) => {
                        const key = `${convo.partnerId}:${s.label || 'story'}`
                        storyImgCache.current[key] = s.image_url
                    })
                    // Also cache latest story as fallback
                    storyImgCache.current[`${convo.partnerId}:latest`] = partnerStories[0].image_url
                }
            }
            setSwapMap(newSwapMap); setMessages(allMsgs)
            await supabase.from('messages').update({ read: true }).eq('to_user_id', uid).eq('from_user_id', convo.partnerId).eq('read', false)
            setConversations(prev => prev.map(c => c.partnerId === convo.partnerId ? { ...c, unread: 0 } : c))
        } catch (e) { console.error('openConversation ERROR:', e) }
        finally { setMsgLoading(false); setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 300) }
    }

    async function sendMessage() {
        if (!newMsg.trim() || !selectedConvo || !currentUser) return
        setSending(true); const body = newMsg.trim(); setNewMsg('')
        const optimistic = { id: 'temp-' + Date.now(), from_user_id: currentUser.id, to_user_id: selectedConvo.partnerId, body, created_at: new Date().toISOString(), read: false, msg_type: 'text', _optimistic: true }
        setMessages(prev => [...prev, optimistic])
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
        try {
            const { data: sent } = await supabase.from('messages').insert({ from_user_id: currentUser.id, to_user_id: selectedConvo.partnerId, body, item_id: selectedConvo.item?.id || null, read: false, msg_type: 'text' }).select().single()
            setMessages(prev => prev.map(m => m.id === optimistic.id ? (sent || optimistic) : m))
            setConversations(prev => prev.map(c => c.partnerId === selectedConvo.partnerId ? { ...c, lastMsg: { ...c.lastMsg, body, created_at: new Date().toISOString() } } : c))
        } catch { setMessages(prev => prev.filter(m => m.id !== optimistic.id)) }
        finally { setSending(false) }
    }

    // CHANGE 9: use FormData instead of fetch().blob() — fetch() fails in React Native on device
    async function pickAndSendImage() {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access.'); return }
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 })
        if (result.canceled || !result.assets[0]) return
        setSending(true)
        try {
            const uri      = result.assets[0].uri
            const ext      = uri.split('.').pop() || 'jpg'
            const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
            const fd       = new FormData()
            fd.append('file', { uri, name: `chat.${ext}`, type: mimeType } as any)
            const fileName = `chat/${currentUser.id}/${Date.now()}.${ext}`
            const { error: ue } = await supabase.storage
                .from('item-images').upload(fileName, fd as any, { contentType: mimeType })
            if (!ue) {
                const { data } = supabase.storage.from('item-images').getPublicUrl(fileName)
                await supabase.from('messages').insert({
                    from_user_id: currentUser.id, to_user_id: selectedConvo.partnerId,
                    body: data.publicUrl, msg_type: 'image',
                    item_id: selectedConvo.item?.id || null, read: false
                })
                await openConversation(selectedConvo)
            }
        } catch { Alert.alert('Error', 'Failed to send image.') }
        finally { setSending(false) }
    }

    async function handleSwapAction(swapId: string, action: string) {
        if (action === 'otp') { setOtpSwapId(swapId); setShowOtp(true); return }
        const confirmMsgs: Record<string, string> = { accepted: 'Accept this swap?', declined: 'Decline this swap?', cancelled: 'Cancel your swap request?' }
        Alert.alert('Confirm', confirmMsgs[action], [
            { text: 'No', style: 'cancel' },
            { text: 'Yes', onPress: async () => {
                const newStatus = action === 'accepted' ? 'otp_pending' : action
                await supabase.from('swaps').update({ status: newStatus }).eq('id', swapId)
                const bodys: Record<string, string> = { accepted: 'Swap accepted! Use the OTP button to confirm the exchange.', declined: 'Swap declined.', cancelled: 'Swap request cancelled.' }
                const types: Record<string, string> = { accepted: 'swap_accepted', declined: 'swap_declined', cancelled: 'swap_cancelled' }
                await supabase.from('messages').insert({ from_user_id: currentUser.id, to_user_id: selectedConvo.partnerId, body: bodys[action], msg_type: types[action], swap_id: swapId, read: false })
                setSwapMap(prev => ({ ...prev, [swapId]: { ...prev[swapId], status: newStatus } }))
                await loadAllSwaps(currentUser.id)
                if (action === 'accepted') { setOtpSwapId(swapId); setShowOtp(true) }
            }}
        ])
    }

    const partnerName   = selectedConvo?.partner?.display_name || selectedConvo?.partner?.username || 'Swapper'
    const partnerAvatar = selectedConvo?.partner?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(partnerName)}&background=EBE0E3&color=C994A7`

    if (selectedConvo) {
        const grouped = messages.reduce((acc: any[], msg, i) => {
            const prev = messages[i - 1]
            const prevDate = prev ? new Date(prev.created_at).toDateString() : null
            const currDate = new Date(msg.created_at).toDateString()
            if (currDate !== prevDate) acc.push({ _type: 'date', id: `d-${currDate}`, date: msg.created_at })
            acc.push({ _type: 'msg', ...msg })
            return acc
        }, [])

        return (
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
                <VideoCallScreen visible={callVisible} partnerName={callPartnerName} partnerAvatar={callPartnerAvatar} callState={callState}
                    localStream={localStream} remoteStream={remoteStream} isMuted={isMuted} isCamOff={isCamOff} isFrontCam={isFrontCam}
                    onAccept={acceptCall} onDecline={declineCall} onEnd={endCall}
                    onToggleMic={toggleMic} onToggleCam={toggleCam} onFlipCamera={flipCamera} />
                <OtpModal visible={showOtp} swapId={otpSwapId} currentUserId={currentUser?.id} partnerId={selectedConvo.partnerId}
                    onClose={() => { setShowOtp(false); setOtpSwapId(null) }}
                    onSuccess={async () => { await openConversation(selectedConvo); await loadAllSwaps(currentUser.id) }} />

                {/* CHANGE 10: header profile tap navigates to PARTNER profile, not own profile */}
                <View style={styles.chatHeader}>
                    <TouchableOpacity onPress={() => { setSelectedConvo(null); loadConversations(currentUser.id) }} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color={GREEN} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.chatHeaderProfile}
                        onPress={() => router.push(`/profile/${selectedConvo.partnerId}` as any)}>
                        <Image source={{ uri: partnerAvatar }} style={styles.chatAvatar} />
                        <View style={styles.chatHeaderInfo}>
                            <Text style={styles.chatName}>{partnerName}</Text>
                            {selectedConvo.item && <Text style={styles.chatSub} numberOfLines={1}>Re: {selectedConvo.item.name}</Text>}
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.videoCallBtn} onPress={() => startVideoCall(selectedConvo.partnerId, partnerName, partnerAvatar)}>
                        <Ionicons name="videocam" size={22} color={GREEN} />
                    </TouchableOpacity>
                </View>

                {selectedConvo.item && (
                    <View style={styles.itemStrip}>
                        <Image source={{ uri: selectedConvo.item.images?.[0] || FALLBACK }} style={styles.itemStripImg} resizeMode="cover" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.itemStripName} numberOfLines={1}>{selectedConvo.item.name}</Text>
                            {selectedConvo.item.pts && <Text style={styles.itemStripPts}>{selectedConvo.item.pts?.toLocaleString()} pts</Text>}
                        </View>
                        <TouchableOpacity onPress={() => router.push(`/item/${selectedConvo.item.id}` as any)}>
                            <Text style={styles.itemStripBtn}>View ↗</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {msgLoading ? (
                    <View style={styles.centered}><ActivityIndicator color={ROSE} /></View>
                ) : (
                    <FlatList ref={flatRef} data={grouped} keyExtractor={m => m.id} contentContainerStyle={styles.msgList}
                        showsVerticalScrollIndicator={false} onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
                        ListEmptyComponent={<View style={styles.emptyChat}><Ionicons name="chatbubbles-outline" size={40} color="#ddd" /><Text style={styles.emptyChatText}>No messages yet. Say hi!</Text></View>}
                        renderItem={({ item: msg }) => {
                            if (msg._type === 'date') return <View style={styles.dateSep}><Text style={styles.dateSepText}>{fmtDate(msg.date)}</Text></View>
                            const isMe = msg.from_user_id === currentUser?.id
                            const swap = msg.swap_id ? swapMap[msg.swap_id] : null

                            if (msg.msg_type === 'swap_request') {
                                if (!swap) return <View style={[styles.msgRow, isMe && styles.msgRowMe]}>{!isMe && <Image source={{ uri: partnerAvatar }} style={styles.msgAvatar} />}<View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}><Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{msg.body}</Text></View></View>
                                return <View style={[styles.msgRow, isMe && styles.msgRowMe]}>{!isMe && <Image source={{ uri: partnerAvatar }} style={styles.msgAvatar} />}<SwapCard swap={swap} currentUserId={currentUser?.id} onAction={handleSwapAction} /></View>
                            }

                            if (msg.msg_type === 'image') return (
                                <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                                    {!isMe && <Image source={{ uri: partnerAvatar }} style={styles.msgAvatar} />}
                                    <Image source={{ uri: msg.body }} style={styles.bubbleImage} resizeMode="cover" />
                                </View>
                            )

                            // Story reply — show preview bubble
                            if (parseStoryReply(msg.body)) {
                                const parsed = parseStoryReply(msg.body)!
                                // Look up by label first, then fall back to latest story from that person
                                const partnerId = isMe ? selectedConvo.partnerId : msg.from_user_id
                                const storyImg  = storyImgCache.current[`${partnerId}:${parsed.label}`]
                                              || storyImgCache.current[`${partnerId}:latest`]
                                              || undefined
                                return <StoryReplyBubble msg={msg} partnerAvatar={partnerAvatar} isMe={isMe} storyImageUrl={storyImg} partnerName={partnerName} />
                            }

                            return (
                                <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                                    {!isMe && <Image source={{ uri: partnerAvatar }} style={styles.msgAvatar} />}
                                    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                                        {['swap_accepted','swap_declined','swap_cancelled','swap_swapped'].includes(msg.msg_type) && (
                                            <View style={styles.swapMsgBadge}><Ionicons name="swap-horizontal" size={10} color={GREEN} /><Text style={styles.swapMsgBadgeText}>Swap Update</Text></View>
                                        )}
                                        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{msg.body}</Text>
                                        <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
                                            {timeAgo(msg.created_at)}{isMe ? (msg._optimistic ? ' · ...' : msg.read ? ' · Read' : ' · Sent') : ''}
                                        </Text>
                                    </View>
                                </View>
                            )
                        }}
                    />
                )}
                <View style={styles.inputBar}>
                    <TouchableOpacity onPress={pickAndSendImage} style={styles.attachBtn} disabled={sending}><Ionicons name="image-outline" size={22} color="#aaa" /></TouchableOpacity>
                    <TextInput style={styles.msgInput} placeholder="Message…" placeholderTextColor="#bbb" value={newMsg} onChangeText={setNewMsg} multiline maxLength={500} />
                    <TouchableOpacity style={[styles.sendBtn, (!newMsg.trim() || sending) && styles.sendBtnOff]} onPress={sendMessage} disabled={!newMsg.trim() || sending}>
                        {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        )
    }

    const pendingCount = allSwaps.filter(s => s.status === 'pending' && s.owner_id === currentUser?.id).length

    return (
        <View style={styles.container}>
            <VideoCallScreen visible={callVisible} partnerName={callPartnerName} partnerAvatar={callPartnerAvatar} callState={callState}
                localStream={localStream} remoteStream={remoteStream} isMuted={isMuted} isCamOff={isCamOff} isFrontCam={isFrontCam}
                onAccept={acceptCall} onDecline={declineCall} onEnd={endCall}
                onToggleMic={toggleMic} onToggleCam={toggleCam} onFlipCamera={flipCamera} />
            <OtpModal visible={showOtp} swapId={otpSwapId} currentUserId={currentUser?.id} partnerId={null}
                onClose={() => { setShowOtp(false); setOtpSwapId(null) }}
                onSuccess={async () => { await loadAllSwaps(currentUser.id) }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={GREEN} /></TouchableOpacity>
                <Text style={styles.headerTitle}>Messages</Text>
                <TouchableOpacity onPress={boot} style={styles.backBtn}><Ionicons name="refresh-outline" size={20} color={GREEN} /></TouchableOpacity>
            </View>
            <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, activeTab === 'msgs' && styles.tabActive]} onPress={() => setActiveTab('msgs')}>
                    <Ionicons name="chatbubble-outline" size={14} color={activeTab === 'msgs' ? ROSE : '#aaa'} />
                    <Text style={[styles.tabText, activeTab === 'msgs' && styles.tabTextActive]}>Messages</Text>
                    {conversations.filter(c => c.unread > 0).length > 0 && <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{conversations.filter(c => c.unread > 0).length}</Text></View>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'swaps' && styles.tabActive]} onPress={() => setActiveTab('swaps')}>
                    <Ionicons name="swap-horizontal-outline" size={14} color={activeTab === 'swaps' ? ROSE : '#aaa'} />
                    <Text style={[styles.tabText, activeTab === 'swaps' && styles.tabTextActive]}>Swaps</Text>
                    {pendingCount > 0 && <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{pendingCount}</Text></View>}
                </TouchableOpacity>
            </View>
            {loading ? (
                <View style={styles.centered}><ActivityIndicator color={ROSE} size="large" /></View>
            ) : activeTab === 'msgs' ? (
                <FlatList data={conversations} keyExtractor={c => c.partnerId} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}
                    ListEmptyComponent={<View style={styles.empty}><Ionicons name="chatbubbles-outline" size={48} color="#ddd" /><Text style={styles.emptyTitle}>No messages yet</Text><Text style={styles.emptyText}>Browse items and start a swap conversation!</Text></View>}
                    renderItem={({ item: convo }) => {
                        const name   = convo.partner?.display_name || convo.partner?.username || 'Swapper'
                        const avatar = convo.partner?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=EBE0E3&color=C994A7`
                        const unread  = convo.unread > 0
                        const preview = convo.lastMsg?.msg_type === 'swap_request' ? 'Sent a swap request'
                            : convo.lastMsg?.msg_type === 'image' ? 'Sent a photo'
                            : parseStoryReply(convo.lastMsg?.body || '') ? '↩ Replied to a story'
                            : convo.lastMsg?.body || '…'
                        return (
                            <TouchableOpacity style={[styles.convoRow, unread && styles.convoRowUnread]} onPress={() => openConversation(convo)}>
                                <View style={styles.avWrap}>
                                    <Image source={{ uri: avatar }} style={styles.convoAv} />
                                    {unread && <View style={styles.unreadDot} />}
                                </View>
                                <View style={styles.convoInfo}>
                                    <View style={styles.convoTop}>
                                        <Text style={[styles.convoName, unread && styles.convoNameU]}>{name}</Text>
                                        <Text style={styles.convoTime}>{timeAgo(convo.lastMsg?.created_at)}</Text>
                                    </View>
                                    <View style={styles.convoBot}>
                                        <Text style={[styles.convoPreview, unread && styles.convoPreviewU]} numberOfLines={1}>
                                            {convo.lastMsg?.from_user_id === currentUser?.id ? 'You: ' : ''}{preview}
                                        </Text>
                                        {unread && <View style={styles.unreadBadge}><Text style={styles.unreadCount}>{convo.unread}</Text></View>}
                                    </View>
                                    {convo.item && <Text style={styles.convoItem} numberOfLines={1}>Re: {convo.item.name}</Text>}
                                </View>
                            </TouchableOpacity>
                        )
                    }}
                />
            ) : (
                <FlatList data={allSwaps} keyExtractor={s => s.id} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}
                    ListEmptyComponent={<View style={styles.empty}><Ionicons name="swap-horizontal-outline" size={48} color="#ddd" /><Text style={styles.emptyTitle}>No swaps yet</Text><Text style={styles.emptyText}>Send a swap request from any item's page.</Text></View>}
                    renderItem={({ item: swap }) => {
                        const isReq = swap.requester_id === currentUser?.id; const partner = isReq ? swap.owner : swap.requester
                        const pName = partner?.display_name || partner?.username || 'User'
                        const ri = swap.ri?.images?.[0] || FALLBACK; const oi = swap.oi?.images?.[0] || FALLBACK
                        const color = STATUS_COLORS[swap.status] || '#888'; const bg = STATUS_BG[swap.status] || '#f5f5f5'
                        const label = STATUS_LABELS[swap.status] || swap.status
                        return (
                            <View style={styles.swapRow}>
                                <View style={styles.swapTop}>
                                    <View style={styles.swapImgs}>
                                        {swap.offered_item_id ? <Image source={{ uri: oi }} style={styles.swapImg} resizeMode="cover" /> : <View style={[styles.swapImg, styles.swapImgPts]}><Ionicons name="cash-outline" size={18} color={GREEN} /></View>}
                                        <Image source={{ uri: ri }} style={[styles.swapImg, styles.swapImg2]} resizeMode="cover" />
                                    </View>
                                    <View style={styles.swapInfo}>
                                        <Text style={styles.swapNames} numberOfLines={1}>{swap.oi?.name || (swap.offered_pts > 0 ? `${swap.offered_pts.toLocaleString()} pts` : '?')} — {swap.ri?.name || 'Item'}</Text>
                                        <Text style={styles.swapPartner}>{isReq ? 'You offered to' : 'Request from'} {pName}</Text>
                                        {swap.offered_pts > 0 && <Text style={styles.swapPts}>+{swap.offered_pts.toLocaleString()} pts included</Text>}
                                    </View>
                                </View>
                                <View style={styles.swapBot}>
                                    <View style={[styles.swapBadge, { backgroundColor: bg }]}><Text style={[styles.swapBadgeText, { color }]}>{label}</Text></View>
                                    <Text style={styles.swapTime}>{timeAgo(swap.created_at)}</Text>
                                </View>
                                {(swap.status === 'accepted' || swap.status === 'otp_pending') && (
                                    <TouchableOpacity style={styles.swapOtpBtn} onPress={() => { setOtpSwapId(swap.id); setShowOtp(true) }}>
                                        <Ionicons name="lock-closed-outline" size={13} color="#fff" /><Text style={styles.swapOtpText}>Enter OTP to Complete</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )
                    }}
                />
            )}
            <View style={styles.bottomNav}>
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home' as any)}>
                    <Ionicons name="home-outline" size={22} color="#bbb" />
                    <Text style={styles.navText}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/dashboard' as any)}>
                    <Ionicons name="grid-outline" size={22} color="#bbb" />
                    <Text style={styles.navText}>Catalog</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => router.push('/post' as any)}>
                    <Ionicons name="add-circle-outline" size={22} color="#bbb" />
                    <Text style={styles.navText}>Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem}>
                    <View style={styles.navIconWrap}>
                        <Ionicons name="chatbubble" size={22} color={ROSE} />
                        {conversations.reduce((sum, c) => sum + (c.unread || 0), 0) > 0 && (
                            <View style={styles.navBadge}>
                                <Text style={styles.navBadgeText}>{conversations.reduce((sum, c) => sum + (c.unread || 0), 0)}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={[styles.navText, { color: ROSE }]}>Messages</Text>
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
    centered:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f0f2' },
    headerTitle:      { fontSize: 17, fontWeight: '700', color: GREEN },
    backBtn:          { padding: 6 },
    tabs:             { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 2, borderBottomColor: '#f0eded' },
    tab:              { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
    tabActive:        { borderBottomWidth: 2, borderBottomColor: ROSE, marginBottom: -2 },
    tabText:          { fontSize: 13, fontWeight: '700', color: '#aaa' },
    tabTextActive:    { color: ROSE },
    tabBadge:         { backgroundColor: ROSE, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    tabBadgeText:     { color: '#fff', fontSize: 9, fontWeight: '800' },
    list:             { padding: 16, paddingBottom: 100 },
    convoRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
    convoRowUnread:   { backgroundColor: '#fff8fa', borderWidth: 1, borderColor: '#f0dfe5' },
    avWrap:           { position: 'relative' },
    convoAv:          { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: BLUSH },
    unreadDot:        { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: ROSE, borderWidth: 2, borderColor: '#fff' },
    convoInfo:        { flex: 1, minWidth: 0 },
    convoTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    convoName:        { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
    convoNameU:       { fontWeight: '700', color: GREEN },
    convoTime:        { fontSize: 11, color: '#bbb' },
    convoBot:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    convoPreview:     { flex: 1, fontSize: 13, color: '#aaa' },
    convoPreviewU:    { color: '#555', fontWeight: '600' },
    convoItem:        { fontSize: 11, color: ROSE, fontWeight: '600', marginTop: 3 },
    unreadBadge:      { backgroundColor: ROSE, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 6 },
    unreadCount:      { color: '#fff', fontSize: 10, fontWeight: '800' },
    swapRow:          { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#f0eded', borderRadius: 16, padding: 14, marginBottom: 10 },
    swapTop:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    swapImgs:         { flexDirection: 'row' },
    swapImg:          { width: 42, height: 42, borderRadius: 10, borderWidth: 2, borderColor: '#fff' },
    swapImg2:         { marginLeft: -12 },
    swapImgPts:       { backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' },
    swapInfo:         { flex: 1 },
    swapNames:        { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
    swapPartner:      { fontSize: 11, color: '#aaa', marginTop: 2 },
    swapPts:          { fontSize: 11, color: '#16a34a', fontWeight: '700', marginTop: 2 },
    swapBot:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    swapBadge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50 },
    swapBadgeText:    { fontSize: 11, fontWeight: '800' },
    swapTime:         { fontSize: 11, color: '#aaa' },
    swapOtpBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, backgroundColor: '#5b21b6', borderRadius: 10, paddingVertical: 10 },
    swapOtpText:      { color: '#fff', fontWeight: '700', fontSize: 13 },
    empty:            { alignItems: 'center', paddingTop: 80, gap: 10 },
    emptyTitle:       { fontSize: 16, fontWeight: '700', color: '#aaa' },
    emptyText:        { fontSize: 13, color: '#bbb', textAlign: 'center' },
    chatHeader:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f0f2' },
    chatHeaderProfile:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    chatAvatar:       { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: BLUSH },
    chatHeaderInfo:   { flex: 1 },
    chatName:         { fontSize: 15, fontWeight: '700', color: GREEN },
    chatSub:          { fontSize: 12, color: '#aaa', marginTop: 1 },
    videoCallBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f0fdf8', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#d1fae5' },
    itemStrip:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#faf4f6', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0dfe5' },
    itemStripImg:     { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#f0dfe5' },
    itemStripName:    { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
    itemStripPts:     { fontSize: 11, color: GREEN, fontWeight: '600' },
    itemStripBtn:     { fontSize: 12, fontWeight: '700', color: GREEN },
    msgList:          { padding: 16, paddingBottom: 20 },
    dateSep:          { alignItems: 'center', marginVertical: 10 },
    dateSepText:      { fontSize: 10, fontWeight: '700', color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.8 },
    msgRow:           { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6 },
    msgRowMe:         { flexDirection: 'row-reverse' },
    msgAvatar:        { width: 28, height: 28, borderRadius: 14 },
    bubble:           { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleMe:         { backgroundColor: GREEN, borderBottomRightRadius: 4 },
    bubbleThem:       { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
    bubbleImage:      { width: 200, height: 200, borderRadius: 16, marginBottom: 4 },
    swapMsgBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUSH, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginBottom: 6, alignSelf: 'flex-start' },
    swapMsgBadgeText: { fontSize: 10, fontWeight: '700', color: GREEN },
    bubbleText:       { fontSize: 14, color: '#1a1a1a', lineHeight: 20 },
    bubbleTextMe:     { color: '#fff' },
    bubbleTime:       { fontSize: 10, color: '#aaa', marginTop: 4, textAlign: 'right' },
    bubbleTimeMe:     { color: 'rgba(255,255,255,0.6)' },
    emptyChat:        { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyChatText:    { fontSize: 14, color: '#bbb', fontWeight: '600' },
    inputBar:         { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f5f0f2' },
    attachBtn:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    msgInput:         { flex: 1, backgroundColor: '#f5f0f2', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#1a1a1a', maxHeight: 100 },
    sendBtn:          { width: 42, height: 42, borderRadius: 21, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
    sendBtnOff:       { opacity: 0.4 },
    bottomNav:        { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f5f0f2', paddingBottom: 24, paddingTop: 12 },
    navItem:          { flex: 1, alignItems: 'center', gap: 4 },
    navText:          { fontSize: 11, color: '#bbb', fontWeight: '600' },
    navIconWrap:      { position: 'relative' },
    navBadge:         { position: 'absolute', top: -4, right: -6, backgroundColor: ROSE, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#fff' },
    navBadgeText:     { color: '#fff', fontSize: 9, fontWeight: '800' },
})