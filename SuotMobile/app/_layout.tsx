import { Stack } from 'expo-router'

export default function RootLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="home" />
            <Stack.Screen name="dashboard" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="follows" />
            <Stack.Screen name="post" />
            <Stack.Screen name="wishlist" />
            <Stack.Screen name="messages" />
            <Stack.Screen name="item/[id]" />
            <Stack.Screen name="(tabs)" />
        </Stack>
    )
}