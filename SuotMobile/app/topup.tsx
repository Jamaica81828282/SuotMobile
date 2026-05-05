import { useEffect, useState, useRef } from 'react'
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, Animated, Alert,
    KeyboardAvoidingView, Platform
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'

// ── Theme ─────────────────────────────────────────────────────────────────────
const ROSE      = '#C994A7'
const ROSE_PALE = '#faf4f6'
const GREEN     = '#4A635D'
const GREEN_DARK = '#37504A'
const BORDER    = '#ede8ea'
const MUTED     = '#9a9a9a'
const BG        = '#FDFBFC'

// ── Types ─────────────────────────────────────────────────────────────────────
type Step   = 1 | 2 | 3 | 4
type Method = 'gcash' | 'maya' | 'card' | 'bank' | 'otc' | ''
interface Pack { pts: number; php: number; label: string; badge?: string; color: string; accent: string }

// ── Static data ───────────────────────────────────────────────────────────────
const PACKS: Pack[] = [
    { pts: 500,  php: 525,  label: 'Starter',      color: '#f0fdf8', accent: GREEN },
    { pts: 2000, php: 2100, label: 'Most Popular',  badge: 'Popular', color: '#fff0f5', accent: ROSE },
    { pts: 5000, php: 5250, label: 'Best Value',    color: '#f5f0ff', accent: '#7c5cbf' },
]
const METHODS = [
    { id: 'gcash', name: 'GCash',               desc: 'Pay via GCash e-wallet',     icon: 'wallet-outline',           color: '#e8f4ff', accent: '#2563eb' },
    { id: 'maya',  name: 'Maya',                desc: 'Pay via Maya e-wallet',      icon: 'checkmark-circle-outline', color: '#eef8f0', accent: '#16a34a' },
    { id: 'card',  name: 'Credit / Debit Card', desc: 'Visa, Mastercard, JCB',      icon: 'card-outline',             color: '#f4f0ff', accent: '#7c3aed' },
    { id: 'bank',  name: 'Online Banking',      desc: 'BDO, BPI, UnionBank & more', icon: 'business-outline',         color: '#fff8e8', accent: '#d97706' },
    { id: 'otc',   name: 'Over-the-Counter',    desc: '7-Eleven, Bayad Center',     icon: 'storefront-outline',       color: '#fef0f0', accent: '#dc2626' },
]
const STEP_LABELS = ['Bundle', 'Payment', 'Details', 'Done']

function formatPhp(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

// =============================================================================
// SUB-COMPONENTS — defined OUTSIDE TopupScreen to prevent keyboard dismiss bug
// =============================================================================

// ── FormField ─────────────────────────────────────────────────────────────────
interface FormFieldProps {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder?: string
    keyboardType?: any
    maxLength?: number
    secureTextEntry?: boolean
}
function FormField({ label, value, onChange, placeholder, keyboardType, maxLength, secureTextEntry }: FormFieldProps) {
    return (
        <View style={styles.formField}>
            <Text style={styles.formLabel}>{label}</Text>
            <TextInput
                style={styles.formInput}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor="#ccc"
                keyboardType={keyboardType || 'default'}
                maxLength={maxLength}
                secureTextEntry={secureTextEntry}
                autoCapitalize="none"
            />
        </View>
    )
}

// ── StepBar ───────────────────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
    return (
        <View style={styles.stepBar}>
            {STEP_LABELS.map((label, i) => {
                const n = (i + 1) as Step
                const done   = n < step
                const active = n === step
                return (
                    <View key={n} style={styles.stepItemWrap}>
                        <View style={[styles.stepCircle, active && styles.stepCircleActive, done && styles.stepCircleDone]}>
                            {done
                                ? <Ionicons name="checkmark" size={11} color="#fff" />
                                : <Text style={[styles.stepNum, (active || done) && { color: '#fff' }]}>{n}</Text>
                            }
                        </View>
                        <Text style={[styles.stepLabel, active && styles.stepLabelActive, done && styles.stepLabelDone]}>{label}</Text>
                        {i < STEP_LABELS.length - 1 && (
                            <View style={[styles.stepLine, done && styles.stepLineDone]} />
                        )}
                    </View>
                )
            })}
        </View>
    )
}

// ── SummaryCard ───────────────────────────────────────────────────────────────
function SummaryCard({ selPts, selPhp }: { selPts: number; selPhp: number }) {
    const basePhp = selPhp > 0 ? parseFloat((selPhp / 1.05).toFixed(2)) : 0
    const taxPhp  = selPhp > 0 ? parseFloat((selPhp - basePhp).toFixed(2)) : 0
    return (
        <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
                <Text style={styles.summaryTopLabel}>Pasa-Points</Text>
                <Text style={styles.summaryTopPts}>{selPts > 0 ? selPts.toLocaleString() + ' pts' : '—'}</Text>
                <Text style={styles.summaryTopSub}>being added to your account</Text>
            </View>
            <View style={styles.summaryBody}>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryRowLabel}>Bundle price</Text>
                    <Text style={styles.summaryRowVal}>{selPhp > 0 ? formatPhp(basePhp) : '₱0.00'}</Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryRowLabel}>Platform tax (5%)</Text>
                    <Text style={styles.summaryRowVal}>{selPhp > 0 ? formatPhp(taxPhp) : '₱0.00'}</Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                    <Text style={styles.summaryTotalLabel}>Total</Text>
                    <Text style={styles.summaryTotalVal}>{selPhp > 0 ? formatPhp(selPhp) : '₱0.00'}</Text>
                </View>
            </View>
        </View>
    )
}

// ── Step1 ─────────────────────────────────────────────────────────────────────
interface Step1Props {
    selPack: Pack | null
    custom: string
    selPts: number
    selPhp: number
    onPickPack: (p: Pack) => void
    onCustomChange: (v: string) => void
    onNext: () => void
}
function Step1({ selPack, custom, selPts, selPhp, onPickPack, onCustomChange, onNext }: Step1Props) {
    const canContinue = selPts > 0 && selPhp > 0
    const customNum   = custom ? parseFloat(custom) : 0
    const customPts   = customNum >= 50 ? Math.floor(customNum) : 0
    const customTotal = customNum >= 50 ? (customNum * 1.05).toFixed(2) : '0.00'

    return (
        <View>
            <Text style={styles.sectionLabel}>Select a Bundle</Text>
            <View style={styles.packGrid}>
                {PACKS.map(pack => {
                    const active = selPack?.pts === pack.pts
                    return (
                        <TouchableOpacity
                            key={pack.pts}
                            style={[styles.packCard, active && styles.packCardActive]}
                            onPress={() => onPickPack(pack)}
                            activeOpacity={0.85}>
                            {pack.badge && (
                                <View style={styles.packBadge}>
                                    <Text style={styles.packBadgeText}>{pack.badge}</Text>
                                </View>
                            )}
                            {active && (
                                <View style={styles.packCheck}>
                                    <Ionicons name="checkmark" size={10} color="#fff" />
                                </View>
                            )}
                            <View style={[styles.packIcon, { backgroundColor: pack.color }]}>
                                <Ionicons name="star-outline" size={20} color={pack.accent} />
                            </View>
                            <Text style={styles.packPts}>{pack.pts.toLocaleString()} pts</Text>
                            <Text style={styles.packPhp}>{formatPhp(pack.php)}</Text>
                            <View style={[styles.packTag, { borderColor: pack.color }]}>
                                <Text style={[styles.packTagText, { color: pack.accent }]}>{pack.label}</Text>
                            </View>
                        </TouchableOpacity>
                    )
                })}
            </View>

            <View style={styles.customWrap}>
                <Text style={styles.sectionLabel}>Custom Amount</Text>
                <View style={styles.customInputRow}>
                    <Text style={styles.customPrefix}>₱</Text>
                    <TextInput
                        style={styles.customInput}
                        value={custom}
                        onChangeText={onCustomChange}
                        placeholder="Enter amount (min ₱50)"
                        placeholderTextColor="#ccc"
                        keyboardType="decimal-pad"
                    />
                </View>
                <View style={styles.taxHint}>
                    <Text style={styles.taxHintText}>5% platform tax included</Text>
                    {customPts > 0 && (
                        <>
                            <Text style={styles.taxHintText}>
                                You'll receive: <Text style={styles.taxHintBold}>{customPts.toLocaleString()} pts</Text>
                            </Text>
                            <Text style={styles.taxHintText}>
                                Total: <Text style={styles.taxHintBold}>₱{customTotal}</Text>
                            </Text>
                        </>
                    )}
                </View>
            </View>

            <TouchableOpacity
                style={[styles.nextBtn, !canContinue && styles.nextBtnDisabled]}
                onPress={onNext}
                disabled={!canContinue}>
                <Text style={styles.nextBtnText}>Continue to Payment</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
        </View>
    )
}

// ── Step2 ─────────────────────────────────────────────────────────────────────
interface Step2Props {
    selMethod: Method
    selPts: number
    selPhp: number
    onSelectMethod: (m: Method) => void
    onBack: () => void
    onNext: () => void
}
function Step2({ selMethod, selPts, selPhp, onSelectMethod, onBack, onNext }: Step2Props) {
    return (
        <View>
            <Text style={styles.sectionLabel}>Payment Method</Text>
            {METHODS.map(m => {
                const active = selMethod === m.id
                return (
                    <TouchableOpacity
                        key={m.id}
                        style={[styles.methodCard, active && styles.methodCardActive]}
                        onPress={() => onSelectMethod(m.id as Method)}
                        activeOpacity={0.8}>
                        <View style={[styles.methodIcon, { backgroundColor: m.color }]}>
                            <Ionicons name={m.icon as any} size={19} color={m.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.methodName}>{m.name}</Text>
                            <Text style={styles.methodDesc}>{m.desc}</Text>
                        </View>
                        <View style={[styles.methodRadio, active && styles.methodRadioActive]}>
                            {active && <View style={styles.methodRadioDot} />}
                        </View>
                    </TouchableOpacity>
                )
            })}

            <SummaryCard selPts={selPts} selPhp={selPhp} />

            <View style={styles.btnRow}>
                <TouchableOpacity style={styles.prevBtn} onPress={onBack}>
                    <Ionicons name="arrow-back" size={14} color={MUTED} />
                    <Text style={styles.prevBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.nextBtn, { flex: 1 }, !selMethod && styles.nextBtnDisabled]}
                    onPress={onNext}
                    disabled={!selMethod}>
                    <Text style={styles.nextBtnText}>Enter Payment Details</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    )
}

// ── Step3 ─────────────────────────────────────────────────────────────────────
interface Step3Props {
    selMethod: Method
    selPts: number
    selPhp: number
    field1: string; setField1: (v: string) => void
    field2: string; setField2: (v: string) => void
    field3: string; setField3: (v: string) => void
    field4: string; setField4: (v: string) => void
    confirming: boolean
    onBack: () => void
    onConfirm: () => void
}
function Step3({
    selMethod, selPts, selPhp,
    field1, setField1, field2, setField2,
    field3, setField3, field4, setField4,
    confirming, onBack, onConfirm
}: Step3Props) {
    const m = selMethod
    return (
        <View>
            {(m === 'gcash' || m === 'maya') && (
                <View>
                    <View style={styles.infoBanner}>
                        <Ionicons name="information-circle-outline" size={16} color={GREEN} style={{ marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.infoBannerTitle}>{m === 'gcash' ? 'GCash' : 'Maya'} Instructions</Text>
                            <Text style={styles.infoBannerText}>
                                Enter your registered {m === 'gcash' ? 'GCash' : 'Maya'} mobile number. You'll receive a payment prompt on your app.
                            </Text>
                        </View>
                    </View>
                    <FormField label="Mobile Number" value={field1} onChange={setField1} placeholder="09XX XXX XXXX" keyboardType="phone-pad" />
                    {m === 'gcash' && (
                        <FormField label="Account Name (optional)" value={field2} onChange={setField2} placeholder="Name on your GCash account" />
                    )}
                </View>
            )}

            {m === 'card' && (
                <View>
                    <FormField label="Cardholder Name" value={field1} onChange={setField1} placeholder="Full name as on card" />
                    <FormField label="Card Number" value={field2} onChange={setField2} placeholder="0000 0000 0000 0000" keyboardType="number-pad" maxLength={19} />
                    <View style={styles.formRow}>
                        <View style={{ flex: 1 }}>
                            <FormField label="Expiry" value={field3} onChange={setField3} placeholder="MM / YY" maxLength={7} />
                        </View>
                        <View style={{ width: 12 }} />
                        <View style={{ flex: 1 }}>
                            <FormField label="CVV" value={field4} onChange={setField4} placeholder="•••" maxLength={4} secureTextEntry />
                        </View>
                    </View>
                </View>
            )}

            {m === 'bank' && (
                <View>
                    <FormField label="Account Number" value={field1} onChange={setField1} placeholder="Your bank account number" keyboardType="number-pad" />
                    <FormField label="Full Name" value={field2} onChange={setField2} placeholder="Account holder name" />
                </View>
            )}

            {m === 'otc' && (
                <View>
                    <View style={[styles.infoBanner, styles.infoBannerWarm]}>
                        <Ionicons name="home-outline" size={16} color="#b45309" style={{ marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.infoBannerTitle, { color: '#92400e' }]}>Over-the-Counter Payment</Text>
                            <Text style={[styles.infoBannerText, { color: '#92400e' }]}>
                                A reference number will be generated. Bring it to any partner outlet (7-Eleven, Bayad Center) within 24 hours.
                            </Text>
                        </View>
                    </View>
                    <FormField label="Your Name" value={field1} onChange={setField1} placeholder="Full name for reference" />
                    <FormField label="Email for Receipt" value={field2} onChange={setField2} placeholder="you@email.com" keyboardType="email-address" />
                </View>
            )}

            <SummaryCard selPts={selPts} selPhp={selPhp} />

            <View style={styles.btnRow}>
                <TouchableOpacity style={styles.prevBtn} onPress={onBack}>
                    <Ionicons name="arrow-back" size={14} color={MUTED} />
                    <Text style={styles.prevBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.nextBtn, { flex: 1 }]}
                    onPress={onConfirm}
                    disabled={confirming}>
                    {confirming
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <>
                            <Text style={styles.nextBtnText}>Confirm & Pay {formatPhp(selPhp)}</Text>
                            <Ionicons name="arrow-forward" size={16} color="#fff" />
                          </>
                    }
                </TouchableOpacity>
            </View>
        </View>
    )
}

// ── Step4 ─────────────────────────────────────────────────────────────────────
function Step4({ selPts, balance, onDone }: { selPts: number; balance: number; onDone: () => void }) {
    return (
        <View style={styles.successWrap}>
            <View style={styles.successIcon}>
                <Ionicons name="checkmark" size={36} color="#fff" />
            </View>
            <Text style={styles.successTitle}>Points Added!</Text>
            <Text style={styles.successDesc}>
                Your Pasa-Points have been topped up successfully. Head back to the catalog and find something you love.
            </Text>
            <View style={styles.successCard}>
                <Text style={styles.successPts}>+{selPts.toLocaleString()} pts</Text>
                <Text style={styles.successBal}>New balance: {balance.toLocaleString()} pts</Text>
            </View>
            <TouchableOpacity style={styles.dashBtn} onPress={onDone}>
                <Ionicons name="home-outline" size={15} color="#fff" />
                <Text style={styles.dashBtnText}>Back to Dashboard</Text>
            </TouchableOpacity>
        </View>
    )
}

// =============================================================================
// MAIN SCREEN
// =============================================================================
export default function TopupScreen() {
    const router = useRouter()

    const [balance,    setBalance]    = useState(0)
    const [loading,    setLoading]    = useState(true)
    const [step,       setStep]       = useState<Step>(1)
    const [selPack,    setSelPack]    = useState<Pack | null>(null)
    const [custom,     setCustom]     = useState('')
    const [selPts,     setSelPts]     = useState(0)
    const [selPhp,     setSelPhp]     = useState(0)
    const [selMethod,  setSelMethod]  = useState<Method>('')
    const [field1,     setField1]     = useState('')
    const [field2,     setField2]     = useState('')
    const [field3,     setField3]     = useState('')
    const [field4,     setField4]     = useState('')
    const [confirming, setConfirming] = useState(false)

    const fadeAnim = useRef(new Animated.Value(1)).current

    useEffect(() => { loadUser() }, [])

    async function loadUser() {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.replace('/login' as any); return }
        const { data: p } = await supabase
            .from('profiles').select('pts').eq('id', session.user.id).single()
        setBalance(p?.pts || 0)
        setLoading(false)
    }

    function pickPack(pack: Pack) {
        setSelPack(pack)
        setSelPts(pack.pts)
        setSelPhp(pack.php)
        setCustom('')
    }

    function onCustomChange(val: string) {
        setCustom(val)
        setSelPack(null)
        const num = parseFloat(val)
        if (num && num >= 50) {
            setSelPts(Math.floor(num))
            setSelPhp(parseFloat((num * 1.05).toFixed(2)))
        } else {
            setSelPts(0)
            setSelPhp(0)
        }
    }

    function goStep(n: Step) {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start()
        setStep(n)
    }

    async function confirmPayment() {
        setConfirming(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not logged in')
            const newBal = balance + selPts
            const { error } = await supabase
                .from('profiles').update({ pts: newBal }).eq('id', session.user.id)
            if (error) throw error
            await supabase.from('topups').insert({
                user_id: session.user.id, pts: selPts, amount_php: selPhp, method: selMethod,
            })
            setBalance(newBal)
            goStep(4)
        } catch (err: any) {
            Alert.alert('Top-up failed', err.message || 'Please try again.')
        } finally {
            setConfirming(false)
        }
    }

    if (loading) {
        return <View style={styles.center}><ActivityIndicator color={ROSE} size="large" /></View>
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.container}>

                {/* HEADER */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={18} color={MUTED} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Top Up Points</Text>
                        <Text style={styles.headerSub}>Choose a bundle & pay</Text>
                    </View>
                    <View style={styles.balChip}>
                        <Ionicons name="time-outline" size={14} color="rgba(255,255,255,.6)" />
                        <View>
                            <Text style={styles.balChipLabel}>Balance</Text>
                            <Text style={styles.balChipVal}>{balance.toLocaleString()} pts</Text>
                        </View>
                    </View>
                </View>

                {/* STEP BAR */}
                <StepBar step={step} />

                {/* STEP CONTENT */}
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled">
                    <Animated.View style={{ opacity: fadeAnim }}>
                        {step === 1 && (
                            <Step1
                                selPack={selPack}
                                custom={custom}
                                selPts={selPts}
                                selPhp={selPhp}
                                onPickPack={pickPack}
                                onCustomChange={onCustomChange}
                                onNext={() => goStep(2)}
                            />
                        )}
                        {step === 2 && (
                            <Step2
                                selMethod={selMethod}
                                selPts={selPts}
                                selPhp={selPhp}
                                onSelectMethod={setSelMethod}
                                onBack={() => goStep(1)}
                                onNext={() => goStep(3)}
                            />
                        )}
                        {step === 3 && (
                            <Step3
                                selMethod={selMethod}
                                selPts={selPts}
                                selPhp={selPhp}
                                field1={field1} setField1={setField1}
                                field2={field2} setField2={setField2}
                                field3={field3} setField3={setField3}
                                field4={field4} setField4={setField4}
                                confirming={confirming}
                                onBack={() => goStep(2)}
                                onConfirm={confirmPayment}
                            />
                        )}
                        {step === 4 && (
                            <Step4
                                selPts={selPts}
                                balance={balance}
                                onDone={() => router.replace('/home' as any)}
                            />
                        )}
                    </Animated.View>
                </ScrollView>

            </View>
        </KeyboardAvoidingView>
    )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container:    { flex: 1, backgroundColor: BG },
    center:       { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
    content:      { padding: 16, paddingBottom: 40 },

    header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: BORDER },
    backBtn:      { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
    headerTitle:  { fontSize: 17, fontWeight: '800', color: GREEN },
    headerSub:    { fontSize: 11, color: MUTED, marginTop: 1 },
    balChip:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GREEN, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50 },
    balChipLabel: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,.5)' },
    balChipVal:   { fontSize: 13, fontWeight: '800', color: '#fff', marginTop: 1 },

    stepBar:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
    stepItemWrap:     { flexDirection: 'row', alignItems: 'center', flex: 1 },
    stepCircle:       { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
    stepCircleActive: { borderColor: ROSE, backgroundColor: ROSE },
    stepCircleDone:   { borderColor: GREEN, backgroundColor: GREEN },
    stepNum:          { fontSize: 10, fontWeight: '800', color: MUTED },
    stepLabel:        { fontSize: 10, fontWeight: '600', color: MUTED, marginLeft: 5, marginRight: 4 },
    stepLabelActive:  { color: ROSE },
    stepLabelDone:    { color: GREEN },
    stepLine:         { flex: 1, height: 2, backgroundColor: BORDER, borderRadius: 2 },
    stepLineDone:     { backgroundColor: GREEN },

    sectionLabel: { fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, color: MUTED, marginBottom: 12 },

    packGrid:       { flexDirection: 'row', gap: 10, marginBottom: 16 },
    packCard:       { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 16, padding: 14, position: 'relative', overflow: 'hidden' },
    packCardActive: { borderColor: ROSE, shadowColor: ROSE, shadowOpacity: 0.15, shadowRadius: 10, elevation: 3 },
    packBadge:      { position: 'absolute', top: 0, right: 0, backgroundColor: ROSE, paddingHorizontal: 8, paddingVertical: 3, borderBottomLeftRadius: 10 },
    packBadgeText:  { fontSize: 8, fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 },
    packCheck:      { position: 'absolute', top: 10, left: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
    packIcon:       { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    packPts:        { fontWeight: '800', fontSize: 15, color: '#1a1a1a', marginBottom: 2 },
    packPhp:        { fontSize: 11, color: MUTED, marginBottom: 8 },
    packTag:        { borderWidth: 1, borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
    packTagText:    { fontSize: 9, fontWeight: '700' },

    customWrap:     { backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 14, padding: 16, marginBottom: 16 },
    customInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, borderRadius: 11, backgroundColor: BG, paddingHorizontal: 12, marginTop: 8 },
    customPrefix:   { fontSize: 15, fontWeight: '700', color: ROSE, marginRight: 4 },
    customInput:    { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a1a', paddingVertical: 11 },
    taxHint:        { marginTop: 8, gap: 3 },
    taxHintText:    { fontSize: 11, color: MUTED },
    taxHintBold:    { fontWeight: '700', color: GREEN },

    nextBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: GREEN, borderRadius: 13, paddingVertical: 14, marginBottom: 8 },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
    prevBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: BORDER, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff' },
    prevBtnText:     { fontSize: 13, fontWeight: '700', color: MUTED },
    btnRow:          { flexDirection: 'row', gap: 10, marginTop: 16 },

    methodCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 13, marginBottom: 8 },
    methodCardActive:  { borderColor: ROSE, backgroundColor: ROSE_PALE },
    methodIcon:        { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    methodName:        { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
    methodDesc:        { fontSize: 11, color: MUTED, marginTop: 1 },
    methodRadio:       { width: 17, height: 17, borderRadius: 9, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    methodRadioActive: { borderColor: ROSE, backgroundColor: ROSE },
    methodRadioDot:    { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },

    summaryCard:       { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 16, overflow: 'hidden', marginTop: 16 },
    summaryTop:        { backgroundColor: GREEN, padding: 18, alignItems: 'center' },
    summaryTopLabel:   { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,.5)', marginBottom: 5 },
    summaryTopPts:     { fontWeight: '800', fontSize: 26, color: '#fff', lineHeight: 30 },
    summaryTopSub:     { fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 4 },
    summaryBody:       { padding: 14 },
    summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryRowLabel:   { fontSize: 12, color: MUTED },
    summaryRowVal:     { fontSize: 12, color: '#1a1a1a', fontWeight: '500' },
    summaryRowTotal:   { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, marginTop: 2, marginBottom: 0 },
    summaryTotalLabel: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
    summaryTotalVal:   { fontSize: 14, fontWeight: '800', color: GREEN },

    formField:       { marginBottom: 12 },
    formLabel:       { fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: MUTED, marginBottom: 6 },
    formInput:       { borderWidth: 1.5, borderColor: BORDER, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11, fontSize: 13.5, color: '#1a1a1a', backgroundColor: '#fff' },
    formRow:         { flexDirection: 'row' },
    infoBanner:      { flexDirection: 'row', gap: 10, backgroundColor: '#eef6f4', borderWidth: 1, borderColor: '#a8cec7', borderRadius: 12, padding: 13, marginBottom: 14 },
    infoBannerWarm:  { backgroundColor: '#fffbef', borderColor: '#d4b87a' },
    infoBannerTitle: { fontSize: 12.5, fontWeight: '700', color: GREEN_DARK, marginBottom: 2 },
    infoBannerText:  { fontSize: 12, color: GREEN_DARK, lineHeight: 18 },

    successWrap:  { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24 },
    successIcon:  { width: 80, height: 80, borderRadius: 40, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: GREEN, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6 },
    successTitle: { fontWeight: '800', fontSize: 24, color: '#1a1a1a', marginBottom: 8 },
    successDesc:  { fontSize: 13.5, color: MUTED, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
    successCard:  { backgroundColor: GREEN, borderRadius: 18, paddingVertical: 22, paddingHorizontal: 48, marginBottom: 28, alignItems: 'center', shadowColor: GREEN, shadowOpacity: 0.25, shadowRadius: 14, elevation: 4 },
    successPts:   { fontWeight: '800', fontSize: 32, color: '#fff', lineHeight: 36 },
    successBal:   { fontSize: 11.5, color: 'rgba(255,255,255,.5)', marginTop: 5, fontWeight: '500' },
    dashBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ROSE, paddingHorizontal: 26, paddingVertical: 12, borderRadius: 50 },
    dashBtnText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
})