import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, Image, ScrollView,
    KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
    const router = useRouter()
    const [isLogin, setIsLogin]       = useState(true)
    const [email, setEmail]           = useState('')
    const [password, setPassword]     = useState('')
    const [fullName, setFullName]     = useState('')
    const [confirm, setConfirm]       = useState('')
    const [loading, setLoading]       = useState(false)
    const [error, setError]           = useState('')
    const [showPw, setShowPw]         = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    async function handleLogin() {
        setError('')
        if (!email || !password) { setError('Please fill in all fields.'); return }
        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        setLoading(false)
        if (error) { setError(error.message); return }
        router.replace('/home' as any)
    }

    async function handleSignup() {
        setError('')
        if (!fullName || !email || !password || !confirm) { setError('Please fill in all fields.'); return }
        if (password !== confirm) { setError('Passwords do not match.'); return }
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
        setLoading(true)
        const { error } = await supabase.auth.signUp({
            email, password,
            options: { data: { full_name: fullName } }
        })
        setLoading(false)
        if (error) { setError(error.message); return }
        setError('Check your email to confirm your account!')
    }

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

                {/* Logo */}
                <Image source={require('../assets/images/logo.jpg')} style={styles.logo} />
                <Text style={styles.brand}>Suot</Text>
                <Text style={styles.tagline}>Your Style, Passed On.</Text>

                {/* Toggle */}
                <View style={styles.toggleRow}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, isLogin && styles.toggleActive]}
                        onPress={() => { setIsLogin(true); setError('') }}>
                        <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>Sign In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, !isLogin && styles.toggleActive]}
                        onPress={() => { setIsLogin(false); setError('') }}>
                        <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>Sign Up</Text>
                    </TouchableOpacity>
                </View>

                {/* Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{isLogin ? 'Welcome back!' : 'Join Suot'}</Text>
                    <Text style={styles.cardSub}>{isLogin ? 'Sign in to continue' : 'Start your sustainable journey'}</Text>

                    {!isLogin && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Full Name</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Your name"
                                placeholderTextColor="#bbb"
                                value={fullName}
                                onChangeText={setFullName}
                            />
                        </View>
                    )}

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your email"
                            placeholderTextColor="#bbb"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.pwWrap}>
                            <TextInput
                                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                placeholder="••••••••"
                                placeholderTextColor="#bbb"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPw}
                            />
                            <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeBtn}>
    <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#aaa" />
</TouchableOpacity>
                        </View>
                    </View>

                    {!isLogin && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Confirm Password</Text>
                            <View style={styles.pwWrap}>
                                <TextInput
                                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                    placeholder="Re-enter password"
                                    placeholderTextColor="#bbb"
                                    value={confirm}
                                    onChangeText={setConfirm}
                                    secureTextEntry={!showConfirm}
                                />
                           <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
    <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="#aaa" />
</TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {error ? <Text style={styles.error}>{error}</Text> : null}

                    <TouchableOpacity
                        style={styles.btnPrimary}
                        onPress={isLogin ? handleLogin : handleSignup}
                        disabled={loading}>
                        {loading
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.btnText}>{isLogin ? 'Sign In' : 'Create Account'}</Text>
                        }
                    </TouchableOpacity>

                </View>

                <Text style={styles.sdg}>🌿 SDG 12: Responsible Consumption</Text>

            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const ROSE  = '#C994A7'
const GREEN = '#4A635D'

const styles = StyleSheet.create({
    container:   { flexGrow: 1, backgroundColor: '#FDFBFC', alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
    logo:        { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
    brand:       { fontFamily: 'serif', fontSize: 32, fontWeight: '700', color: GREEN, marginBottom: 4 },
    tagline:     { fontSize: 13, color: '#999', marginBottom: 28 },
    toggleRow:   { flexDirection: 'row', backgroundColor: '#f5f0f2', borderRadius: 50, padding: 4, marginBottom: 24, width: '100%' },
    toggleBtn:   { flex: 1, paddingVertical: 10, borderRadius: 50, alignItems: 'center' },
toggleActive:     { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
toggleText:       { fontSize: 14, fontWeight: '600', color: '#aaa' },    toggleTextActive: { color: GREEN, fontWeight: '700' },
    card:        { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, elevation: 4, marginBottom: 24 },
    cardTitle:   { fontFamily: 'serif', fontSize: 22, fontWeight: '700', color: GREEN, textAlign: 'center', marginBottom: 4 },
    cardSub:     { fontSize: 13, color: ROSE, fontWeight: '600', textAlign: 'center', marginBottom: 20 },
    inputGroup:  { marginBottom: 16 },
    label:       { fontSize: 11, fontWeight: '700', color: GREEN, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    input:       { backgroundColor: '#faf8f9', borderWidth: 1, borderColor: '#eee', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#1a1a1a' },
    pwWrap:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#faf8f9', borderWidth: 1, borderColor: '#eee', borderRadius: 12, paddingRight: 12 },
    eyeBtn:      { padding: 8 },
    error:       { color: '#c0392b', fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
    btnPrimary:  { backgroundColor: ROSE, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
    btnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
    sdg:         { fontSize: 12, color: '#bbb', marginTop: 8 },
})