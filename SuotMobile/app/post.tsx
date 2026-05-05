import { useState } from 'react'
import { useUnreadCount } from '../hooks/useUnreadCount'
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Image, TextInput,
    ActivityIndicator, Alert
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import MapView, { Marker } from 'react-native-maps'
import { supabase } from '../lib/supabase'
 
const ROSE  = '#C994A7'
const GREEN = '#4A635D'
const BLUSH = '#EBE0E3'

const CATEGORIES = ['Tops', 'Bottoms', 'Accessories', 'Outerwear', 'Footwear']
const CONDITIONS = ['Well Loved', 'Good', 'Very Good', 'Like New', 'Brand New']
const SIZES      = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free']
const TAGS       = ['Casual', 'Streetwear', 'Vintage', 'Minimal', 'Y2K', 'Boho', 'Formal', 'Athleisure']

export default function PostScreen() {
    const router = useRouter()

    // Form state
    const [images, setImages]         = useState<string[]>([])
    const [name, setName]             = useState('')
    const [description, setDesc]      = useState('')
    const [brand, setBrand]           = useState('')
    const [category, setCategory]     = useState('')
    const [condition, setCondition]   = useState('Like New')
    const [size, setSize]             = useState('')
    const [pts, setPts]               = useState('500')
    const [selectedTags, setTags]     = useState<string[]>([])
    const [loading, setLoading]       = useState(false)
const unreadCount = useUnreadCount()
    // Map state
    const [mapRegion, setMapRegion]   = useState({
        latitude: 12.8797, longitude: 121.774,
        latitudeDelta: 8, longitudeDelta: 8
    })
    const [marker, setMarker]         = useState<{ latitude: number; longitude: number } | null>(null)
    const [address, setAddress]       = useState('')
    const [locLoading, setLocLoading] = useState(false)

    async function pickImage() {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow access to your photos.')
            return
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            quality: 0.8,
            selectionLimit: 5,
        })
        if (!result.canceled) {
            const uris = result.assets.map(a => a.uri)
            setImages(prev => [...prev, ...uris].slice(0, 5))
        }
    }

    async function useMyLocation() {
        setLocLoading(true)
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow location access.')
            setLocLoading(false)
            return
        }
        const loc = await Location.getCurrentPositionAsync({})
        const { latitude, longitude } = loc.coords
        setMarker({ latitude, longitude })
        setMapRegion({ latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 })

        // Reverse geocode
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude })
        if (geo.length > 0) {
            const g = geo[0]
            setAddress([g.street, g.city, g.region].filter(Boolean).join(', '))
        }
        setLocLoading(false)
    }

    function handleMapPress(e: any) {
        const { latitude, longitude } = e.nativeEvent.coordinate
        setMarker({ latitude, longitude })
        // Reverse geocode on tap
        Location.reverseGeocodeAsync({ latitude, longitude }).then(geo => {
            if (geo.length > 0) {
                const g = geo[0]
                setAddress([g.street, g.city, g.region].filter(Boolean).join(', '))
            }
        })
    }

    function toggleTag(tag: string) {
        setTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        )
    }

    async function uploadImage(uri: string, userId: string): Promise<string> {
    const fileName  = `${userId}/${Date.now()}.jpg`
    const formData  = new FormData()

    formData.append('file', {
        uri,
        name:  fileName,
        type:  'image/jpeg',
    } as any)

    const { error } = await supabase.storage
        .from('item-images')
        .upload(fileName, formData, { contentType: 'multipart/form-data' })

    if (error) throw error

    const { data } = supabase.storage.from('item-images').getPublicUrl(fileName)
    return data.publicUrl
}
    async function handlePost() {
        if (!name.trim())        { Alert.alert('Missing', 'Please enter an item name.'); return }
        if (!category)           { Alert.alert('Missing', 'Please select a category.'); return }
        if (!condition)          { Alert.alert('Missing', 'Please select a condition.'); return }
        if (!pts.trim())         { Alert.alert('Missing', 'Please enter points value.'); return }
        if (images.length === 0) { Alert.alert('Missing', 'Please add at least one photo.'); return }

        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) { router.replace('/login' as any); return }

            const uploadedUrls = await Promise.all(
                images.map(uri => uploadImage(uri, session.user.id))
            )

           const { error } = await supabase.from('items').insert({
    user_id:        session.user.id,
    name:           name.trim(),
    description:    description.trim(),
    brand:          brand.trim(),
    category:       category.toLowerCase(),
    condition,
    size,
    tags:           selectedTags,
    pts:            parseInt(pts),
    images:         uploadedUrls,
    // image:       uploadedUrls[0],  ← remove this line
    latitude:       marker?.latitude || null,
    longitude:      marker?.longitude || null,
    meetup_address: address || null,
})

            if (error) throw error

            Alert.alert('Posted!', `"${name}" is now live on Suot!`, [
                { text: 'OK', onPress: () => router.replace('/dashboard' as any) }
            ])
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <View style={styles.container}>

            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={GREEN} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Post an Item</Text>
                <View style={{ width: 34 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                {/* PHOTOS */}
                <Text style={styles.sectionLabel}>Photos (up to 5)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
                    {images.map((uri, i) => (
                        <View key={i} style={styles.imageThumb}>
                            <Image source={{ uri }} style={styles.thumbImg} />
                            {i === 0 && <View style={styles.mainBadge}><Text style={styles.mainBadgeText}>Main</Text></View>}
                            <TouchableOpacity
                                style={styles.removeImg}
                                onPress={() => setImages(prev => prev.filter((_, idx) => idx !== i))}>
                                <Ionicons name="close-circle" size={22} color={ROSE} />
                            </TouchableOpacity>
                        </View>
                    ))}
                    {images.length < 5 && (
                        <TouchableOpacity style={styles.addImageBtn} onPress={pickImage}>
                            <Ionicons name="camera-outline" size={28} color="#ccc" />
                            <Text style={styles.addImageText}>Add Photo</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>

                {/* ITEM NAME */}
                <Text style={styles.sectionLabel}>Item Name</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. Vintage Denim Jacket"
                    placeholderTextColor="#bbb"
                    value={name}
                    onChangeText={setName}
                />

                {/* BRAND */}
                <Text style={styles.sectionLabel}>Brand (optional)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. Levi's, Zara"
                    placeholderTextColor="#bbb"
                    value={brand}
                    onChangeText={setBrand}
                />

                {/* DESCRIPTION */}
                <Text style={styles.sectionLabel}>Description</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Style, material, fit, any special details..."
                    placeholderTextColor="#bbb"
                    value={description}
                    onChangeText={setDesc}
                    multiline
                    numberOfLines={4}
                />

                {/* CATEGORY */}
                <Text style={styles.sectionLabel}>Category</Text>
                <View style={styles.chipRow}>
                    {CATEGORIES.map(cat => (
                        <TouchableOpacity
                            key={cat}
                            style={[styles.chip, category === cat && styles.chipActive]}
                            onPress={() => setCategory(cat)}>
                            <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                                {cat}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* CONDITION */}
                <Text style={styles.sectionLabel}>Condition</Text>
                <View style={styles.chipRow}>
                    {CONDITIONS.map(cond => (
                        <TouchableOpacity
                            key={cond}
                            style={[styles.chip, condition === cond && styles.chipActive]}
                            onPress={() => setCondition(cond)}>
                            <Text style={[styles.chipText, condition === cond && styles.chipTextActive]}>
                                {cond}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* SIZE */}
                <Text style={styles.sectionLabel}>Size</Text>
                <View style={styles.chipRow}>
                    {SIZES.map(s => (
                        <TouchableOpacity
                            key={s}
                            style={[styles.chip, size === s && styles.chipActive]}
                            onPress={() => setSize(s)}>
                            <Text style={[styles.chipText, size === s && styles.chipTextActive]}>
                                {s}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* STYLE TAGS */}
                <Text style={styles.sectionLabel}>Style Tags</Text>
                <View style={styles.chipRow}>
                    {TAGS.map(tag => (
                        <TouchableOpacity
                            key={tag}
                            style={[styles.chip, selectedTags.includes(tag) && styles.chipTagActive]}
                            onPress={() => toggleTag(tag)}>
                            <Text style={[styles.chipText, selectedTags.includes(tag) && styles.chipTextActive]}>
                                {tag}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* POINTS */}
                <Text style={styles.sectionLabel}>Points Value</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. 500"
                    placeholderTextColor="#bbb"
                    value={pts}
                    onChangeText={setPts}
                    keyboardType="numeric"
                />
                <View style={styles.ptsPresets}>
                    {[250, 500, 750, 1000].map(p => (
                        <TouchableOpacity
                            key={p}
                            style={styles.ptsPreset}
                            onPress={() => setPts(String(p))}>
                            <Text style={styles.ptsPresetText}>{p}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* MAP */}
                <Text style={styles.sectionLabel}>Meetup Location</Text>
                <Text style={styles.mapSub}>Tap the map to pin where you'd like to meet for the swap</Text>

                <TouchableOpacity
                    style={styles.locateBtn}
                    onPress={useMyLocation}
                    disabled={locLoading}>
                    {locLoading
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <>
                            <Ionicons name="locate-outline" size={16} color="#fff" />
                            <Text style={styles.locateBtnText}>Use My Location</Text>
                          </>
                    }
                </TouchableOpacity>

                <MapView
                    style={styles.map}
                    region={mapRegion}
                    onPress={handleMapPress}
                    showsUserLocation>
                    {marker && (
                        <Marker
                            coordinate={marker}
                            pinColor={ROSE}
                        />
                    )}
                </MapView>

                {address ? (
                    <View style={styles.addressPill}>
                        <Ionicons name="location" size={14} color={GREEN} />
                        <Text style={styles.addressText} numberOfLines={2}>{address}</Text>
                        <TouchableOpacity onPress={() => { setMarker(null); setAddress('') }}>
                            <Ionicons name="close-circle" size={18} color="#bbb" />
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* SUBMIT */}
                <TouchableOpacity
                    style={styles.btnPost}
                    onPress={handlePost}
                    disabled={loading}>
                    {loading
                        ? <ActivityIndicator color="#fff" />
                        : <>
                            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                            <Text style={styles.btnPostText}>Post Item</Text>
                          </>
                    }
                </TouchableOpacity>

            </ScrollView>

            {/* BOTTOM NAV */}
           <View style={styles.bottomNav}>
                           <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home' as any)}>
                               <Ionicons name="home-outline" size={22} color="#bbb" />
                               <Text style={styles.navText}>Home</Text>
                           </TouchableOpacity>
                           <TouchableOpacity style={styles.navItem}>
                               <Ionicons name="grid" size={22} color= "#bbb" />
                               <Text style={[styles.navText, { color: "#bbb" }]}>Catalog</Text>
                           </TouchableOpacity>
                           <TouchableOpacity style={styles.navItem} onPress={() => router.push('/post' as any)}>
                               <Ionicons name="add-circle" size={22} color={ROSE} />
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
    container:       { flex: 1, backgroundColor: '#FDFBFC' },
    header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f0f2' },
    headerTitle:     { fontSize: 17, fontWeight: '700', color: GREEN },
    backBtn:         { padding: 6 },
    content:         { padding: 20, paddingBottom: 40 },
    sectionLabel:    { fontSize: 12, fontWeight: '700', color: GREEN, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 18 },
    imageRow:        { marginBottom: 4 },
    imageThumb:      { position: 'relative', marginRight: 10 },
    thumbImg:        { width: 100, height: 100, borderRadius: 12, backgroundColor: BLUSH },
    mainBadge:       { position: 'absolute', bottom: 6, left: 6, backgroundColor: GREEN, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    mainBadgeText:   { color: '#fff', fontSize: 9, fontWeight: '700' },
    removeImg:       { position: 'absolute', top: -6, right: -6 },
    addImageBtn:     { width: 100, height: 100, borderRadius: 12, borderWidth: 1.5, borderColor: '#eee', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
    addImageText:    { fontSize: 11, color: '#ccc', fontWeight: '600' },
    input:           { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#1a1a1a' },
    textArea:        { height: 100, textAlignVertical: 'top' },
    chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip:            { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 50, borderWidth: 1.5, borderColor: '#eee', backgroundColor: '#fff' },
    chipActive:      { backgroundColor: GREEN, borderColor: GREEN },
    chipTagActive:   { backgroundColor: ROSE, borderColor: ROSE },
    chipText:        { fontSize: 13, fontWeight: '600', color: '#aaa' },
    chipTextActive:  { color: '#fff' },
    ptsPresets:      { flexDirection: 'row', gap: 8, marginTop: 8 },
    ptsPreset:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 50, borderWidth: 1.5, borderColor: '#eee', backgroundColor: '#fff' },
    ptsPresetText:   { fontSize: 13, fontWeight: '600', color: GREEN },
    mapSub:          { fontSize: 12, color: '#aaa', marginBottom: 10 },
    locateBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GREEN, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 50, alignSelf: 'flex-start', marginBottom: 12 },
    locateBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
    map:             { width: '100%', height: 220, borderRadius: 16, marginBottom: 10 },
    addressPill:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f5f0f2', borderRadius: 12, padding: 12, marginBottom: 8 },
    addressText:     { flex: 1, fontSize: 13, color: GREEN, fontWeight: '600' },
    btnPost:         { backgroundColor: ROSE, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24, flexDirection: 'row', justifyContent: 'center', gap: 8 },
    btnPostText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
    bottomNav:       { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f5f0f2', paddingBottom: 24, paddingTop: 12 },
    navItem:         { flex: 1, alignItems: 'center', gap: 4 },
    navText:         { fontSize: 11, color: '#bbb', fontWeight: '600' },
    navIconWrap: { position: 'relative' },
navBadge:    { position: 'absolute', top: -4, right: -6, backgroundColor: '#C994A7', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#fff' },
navBadgeText:{ color: '#fff', fontSize: 9, fontWeight: '800' },
})