import { Image } from 'react-native'
import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'

const { width, height } = Dimensions.get('window')

const BG    = '#FDF8FA'
const ROSE  = '#C994A7'
const GREEN = '#4A635D'
const BLUSH = '#EBE0E3'
const DIM   = '#A8B8B3'

function Sparkle({ size = 14, color = ROSE }: { size?: number; color?: string }) {
    const bar = { position: 'absolute' as const, backgroundColor: color, borderRadius: 1 }
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <View style={[bar, { width: 2, height: size, opacity: 0.85 }]} />
            <View style={[bar, { width: size, height: 2, opacity: 0.85 }]} />
            <View style={[bar, { width: 1.5, height: size * 0.7, opacity: 0.5, transform: [{ rotate: '45deg' }] }]} />
            <View style={[bar, { width: size * 0.7, height: 1.5, opacity: 0.5, transform: [{ rotate: '45deg' }] }]} />
        </View>
    )
}

function Diamond({ size = 8, color = ROSE }: { size?: number; color?: string }) {
    return (
        <View style={{
            width: size, height: size,
            backgroundColor: color,
            transform: [{ rotate: '45deg' }],
            borderRadius: 1,
        }} />
    )
}

function Hanger({ size = 22, color = GREEN }: { size?: number; color?: string }) {
    const stroke = 1.8
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{
                position: 'absolute', top: 0,
                width: size * 0.22, height: size * 0.22,
                borderRadius: size * 0.11,
                borderWidth: stroke, borderColor: color,
            }} />
            <View style={{
                position: 'absolute', top: size * 0.18,
                width: size * 0.72, height: size * 0.35,
                borderTopLeftRadius: size * 0.5,
                borderTopRightRadius: size * 0.5,
                borderTopWidth: stroke, borderLeftWidth: stroke, borderRightWidth: stroke,
                borderColor: color,
                borderBottomWidth: 0,
            }} />
            <View style={{
                position: 'absolute', bottom: 0,
                width: size, height: stroke,
                backgroundColor: color, borderRadius: 1,
            }} />
        </View>
    )
}

export default function SplashScreen() {
    const router = useRouter()

    const logoOpacity = useRef(new Animated.Value(0)).current
    const logoScale   = useRef(new Animated.Value(1.06)).current

    const line1Y  = useRef(new Animated.Value(20)).current
    const line1Op = useRef(new Animated.Value(0)).current
    const line2Y  = useRef(new Animated.Value(20)).current
    const line2Op = useRef(new Animated.Value(0)).current
    const line3Y  = useRef(new Animated.Value(20)).current
    const line3Op = useRef(new Animated.Value(0)).current
    const line4Op = useRef(new Animated.Value(0)).current

    const divW = useRef(new Animated.Value(0)).current

    const dot1 = useRef(new Animated.Value(0.2)).current
    const dot2 = useRef(new Animated.Value(0.2)).current
    const dot3 = useRef(new Animated.Value(0.2)).current

    useEffect(() => {
        Animated.parallel([
            Animated.timing(logoOpacity, {
                toValue: 0.55, duration: 1000, useNativeDriver: true,
            }),
            Animated.timing(logoScale, {
                toValue: 1, duration: 1100,
                easing: Easing.out(Easing.quad), useNativeDriver: true,
            }),
        ]).start()

        const D = 500
        const slide = (yAnim: Animated.Value, opAnim: Animated.Value, delay: number) =>
            Animated.parallel([
                Animated.timing(opAnim, { toValue: 1, duration: 460, delay, useNativeDriver: true }),
                Animated.timing(yAnim,  { toValue: 0, duration: 460, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ])

        Animated.parallel([
            slide(line1Y, line1Op, D),
            slide(line2Y, line2Op, D + 110),
            slide(line3Y, line3Op, D + 220),
            Animated.timing(line4Op, { toValue: 1, duration: 400, delay: D + 330, useNativeDriver: true }),
            Animated.timing(divW, {
                toValue: 1, duration: 500, delay: D + 90,
                easing: Easing.out(Easing.cubic), useNativeDriver: false,
            }),
        ]).start()

        setTimeout(startDots, D + 600)
        setTimeout(checkAuth, 2600)
    }, [])

    function startDots() {
        const pulse = (anim: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(anim, { toValue: 1,   duration: 520, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(anim, { toValue: 0.2, duration: 520, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ])
            )
        pulse(dot1, 0).start()
        pulse(dot2, 175).start()
        pulse(dot3, 350).start()
    }

    async function checkAuth() {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            router.replace(session ? '/(tabs)' as any : '/login' as any)
        } catch {
            router.replace('/login' as any)
        }
    }

    const divInterp = divW.interpolate({
        inputRange:  [0, 1],
        outputRange: ['0%', '100%'],
    })

    return (
        <View style={s.container}>

            {/* ── Background blobs ──────────────────────────────── */}
            <View style={s.blobTop} />
            <View style={s.blobBottom} />
            <View style={s.blobMid} />

            {/* ── Logo — visible, fills most of the screen ─────── */}
            <Animated.View style={[
                s.logoBg,
                { opacity: logoOpacity, transform: [{ scale: logoScale }] }
            ]}>
                <Image
                    source={require('../assets/images/logo.jpg')}
                    style={s.logoImage}
                    resizeMode="contain"
                />
            </Animated.View>

            {/* ── Text pinned to the bottom ─────────────────────── */}
            <View style={s.bottomContent}>

                {/* Icon row */}
                <Animated.View style={[s.iconRow, { opacity: line1Op, transform: [{ translateY: line1Y }] }]}>
                    <Diamond size={7} color={ROSE} />
                    <View style={s.iconLine} />
                    <Hanger size={20} color={GREEN} />
                    <View style={s.iconLine} />
                    <Diamond size={7} color={ROSE} />
                </Animated.View>

                {/* Brand name */}
                <Animated.Text style={[s.brandName, { opacity: line1Op, transform: [{ translateY: line1Y }] }]}>
                    suot
                </Animated.Text>

                {/* Growing divider */}
                <Animated.View style={[s.divider, { width: divInterp }]} />

                {/* Tagline */}
                <Animated.Text style={[s.tagline, { opacity: line2Op, transform: [{ translateY: line2Y }] }]}>
                    SWAP CLOTHES, NOT MONEY
                </Animated.Text>

                {/* Sub-copy */}
                <Animated.Text style={[s.subCopy, { opacity: line3Op, transform: [{ translateY: line3Y }] }]}>
                    Give your wardrobe a second life
                </Animated.Text>

                {/* Bottom accent + dots */}
                <Animated.View style={[s.bottomIconRow, { opacity: line4Op }]}>
                    <View style={s.bottomLine} />
                    <Sparkle size={9} color={ROSE} />
                    <View style={s.bottomLine} />
                </Animated.View>

                <View style={s.dotsRow}>
                    <Animated.View style={[s.dot, { opacity: dot1 }]} />
                    <Animated.View style={[s.dot, { opacity: dot2 }]} />
                    <Animated.View style={[s.dot, { opacity: dot3 }]} />
                </View>

                <Animated.Text style={[s.bottomBadge, { opacity: line4Op }]}>
                    SUSTAINABLE FASHION EXCHANGE
                </Animated.Text>

            </View>

        </View>
    )
}

const LOGO_BG_SIZE = width * 0.92

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: BG,
    },

    blobTop: {
        position: 'absolute',
        top: -90, right: -90,
        width: 300, height: 300,
        borderRadius: 150,
        backgroundColor: BLUSH,
        opacity: 0.55,
    },
    blobBottom: {
        position: 'absolute',
        bottom: -70, left: -70,
        width: 240, height: 240,
        borderRadius: 120,
        backgroundColor: ROSE,
        opacity: 0.10,
    },
    blobMid: {
        position: 'absolute',
        top: height * 0.35, left: -40,
        width: 160, height: 160,
        borderRadius: 80,
        backgroundColor: GREEN,
        opacity: 0.06,
    },

    // Logo — centered in the upper portion
    logoBg: {
        position: 'absolute',
        top: height * 0.08,
        alignSelf: 'center',
        width: LOGO_BG_SIZE,
        height: LOGO_BG_SIZE,
    },
    logoImage: {
        width: LOGO_BG_SIZE,
        height: LOGO_BG_SIZE,
    },

    // All text pinned to bottom
    bottomContent: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingBottom: 44,
        paddingHorizontal: 32,
        // Fade out the top edge so it blends into the logo
        backgroundColor: 'transparent',
    },

    iconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    iconLine: {
        width: 28, height: 1,
        backgroundColor: ROSE,
        opacity: 0.4,
    },

    brandName: {
        fontSize: 62,
        fontWeight: '800',
        color: GREEN,
        letterSpacing: 18,
        marginBottom: 14,
        textShadowColor: 'rgba(253,248,250,0.85)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 16,
    },

    divider: {
        height: 1.5,
        backgroundColor: ROSE,
        opacity: 0.5,
        marginBottom: 12,
        alignSelf: 'center',
    },

    tagline: {
        fontSize: 10.5,
        fontWeight: '700',
        color: GREEN,
        letterSpacing: 4,
        marginBottom: 8,
        opacity: 0.8,
    },

    subCopy: {
        fontSize: 13,
        fontWeight: '300',
        color: ROSE,
        letterSpacing: 0.6,
        marginBottom: 16,
    },

    bottomIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    bottomLine: {
        width: 40, height: 1,
        backgroundColor: ROSE,
        opacity: 0.3,
    },

    dotsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 18,
    },
    dot: {
        width: 5, height: 5,
        borderRadius: 3,
        backgroundColor: ROSE,
    },

    bottomBadge: {
        fontSize: 9,
        color: DIM,
        letterSpacing: 2.5,
        fontWeight: '500',
    },
})