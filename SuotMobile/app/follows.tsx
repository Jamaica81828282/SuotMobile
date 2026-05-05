import { useEffect, useState } from 'react'
import {
    View, Text, StyleSheet, FlatList,
    TouchableOpacity, Image, ActivityIndicator
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'

const ROSE  = '#C994A7'
const GREEN = '#4A635D'
const BLUSH = '#EBE0E3'

export default function FollowsScreen() {
    const router = useRouter()
    const { type } = useLocalSearchParams<{ type: 'followers' | 'following' }>()
    const [users, setUsers]     = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadUsers()
    }, [type])

    async function loadUsers() {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        if (type === 'followers') {
            // People who follow me
            const { data } = await supabase
                .from('follows')
                .select('follower_id, profiles!follows_follower_id_fkey(id, display_name, username, avatar_url)')
                .eq('following_id', session.user.id)
            setUsers(data?.map(d => d.profiles) || [])
        } else {
            // People I follow
            const { data } = await supabase
                .from('follows')
                .select('following_id, profiles!follows_following_id_fkey(id, display_name, username, avatar_url)')
                .eq('follower_id', session.user.id)
            setUsers(data?.map(d => d.profiles) || [])
        }

        setLoading(false)
    }

    return (
        <View style={styles.container}>

            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={GREEN} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {type === 'followers' ? 'Followers' : 'Following'}
                </Text>
                <View style={{ width: 34 }} />
            </View>

            {loading ? (
                <ActivityIndicator color={ROSE} size="large" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={users}
                    keyExtractor={item => item?.id}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="people-outline" size={48} color="#ddd" />
                            <Text style={styles.emptyText}>
                                {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        if (!item) return null
                        const name = item.display_name || item.username || 'User'
                        const avatar = item.avatar_url ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=EBE0E3&color=C994A7`
                        return (
                            <View style={styles.userRow}>
                                <Image source={{ uri: avatar }} style={styles.avatar} />
                                <View style={styles.userInfo}>
                                    <Text style={styles.userName}>{name}</Text>
                                    <Text style={styles.userHandle}>@{item.username || 'user'}</Text>
                                </View>
                            </View>
                        )
                    }}
                />
            )}

        </View>
    )
}

const styles = StyleSheet.create({
    container:   { flex: 1, backgroundColor: '#FDFBFC' },
    header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f0f2' },
    headerTitle: { fontSize: 17, fontWeight: '700', color: GREEN },
    backBtn:     { padding: 6 },
    list:        { padding: 16 },
    userRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', padding: 14, borderRadius: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
    avatar:      { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: BLUSH },
    userInfo:    { flex: 1 },
    userName:    { fontSize: 15, fontWeight: '700', color: GREEN },
    userHandle:  { fontSize: 13, color: '#aaa', marginTop: 2 },
    empty:       { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyText:   { fontSize: 14, color: '#bbb', fontWeight: '600' },
})