import { useEffect } from 'react'
import { useRouter } from 'expo-router'

export default function Index() {
    const router = useRouter()
   useEffect(() => {
    const timer = setTimeout(() => {
        router.replace('/login' as any)
    }, 100)
    return () => clearTimeout(timer)
}, [])

    return null
}