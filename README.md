<div align="center">

# 👗 Suot Mobile

### *Style passed on.*

A mobile-first peer-to-peer fashion swapping app for the Philippines.  
Swap pre-loved clothing, earn **Pasa-Points**, and build a sustainable wardrobe — no money needed.

[![Status](https://img.shields.io/badge/Status-Active-4A635D?style=flat-square)](https://github.com/Jamaica81828282/SuotMobile)
[![React Native](https://img.shields.io/badge/React_Native-Expo-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![SDG 12](https://img.shields.io/badge/SDG_12-Responsible_Consumption-C994A7?style=flat-square)](https://sdgs.un.org/goals/goal12)
[![License](https://img.shields.io/badge/License-Academic-EBE0E3?style=flat-square)](./LICENSE)

</div>

---

## 📖 About

The fashion industry is one of the world's largest polluters. In the Philippines, fast fashion drives overconsumption while perfectly wearable clothes pile up in landfills. **Suot** ("to wear" in Filipino) tackles this head-on — a community-driven digital bartering platform that replaces monetary transactions with a gamified **Pasa-Points** system, giving clothes a second life through community-based swapping.

**Suot Mobile** is the React Native / Expo mobile version of the platform, built for Android and iOS.

---

## ✨ Features

- 🔄 **Swap System** — Item-for-item or item + Pasa-Points exchanges with OTP confirmation
- 💰 **Pasa-Points Wallet** — Active balance capped at 2,500 pts with auto-refilling circulation buffer (expires in 30 days)
- 📋 **Transaction History** — Full wallet event log with type badges
- 🗺️ **Meetup Map** — Pin your preferred swap meetup location with address search
- 🤖 **AI Price Suggester** — Gemini API recommends fair Pasa-Points pricing based on item details
- 💬 **Real-time Messaging** — Live chat with swap offer cards, emoji reactions, and image sharing
- 📹 **Peer-to-Peer Video Calls** — Native WebRTC video calling with ringing, toggles, and call history
- 👥 **Friends & Discovery** — Follow system with online presence indicators
- 🔔 **Notifications** — Per-type bell notifications (likes, follows, swaps, comments, wishlists)
- 📍 **Distance Filter** — Geolocation-based catalog sorting with configurable radius

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo (file-based routing) |
| Language | TypeScript |
| Backend / Database | Supabase — PostgreSQL, Auth, Storage, Realtime |
| Maps | Leaflet.js + OpenStreetMap + Nominatim |
| Video Calls | Native WebRTC + Supabase Broadcast signaling |
| AI Pricing | Google Gemini API `gemini-2.0-flash` |
| Styling | Expo Themes + Custom Design Tokens |

---

## 📁 Project Structure

```
SuotMobile/
├── app/
│   ├── (tabs)/             # Tab-based screens
│   │   ├── _layout.tsx
│   │   ├── index.tsx       # Home / Catalog
│   │   └── explore.tsx
│   ├── _layout.tsx         # Root layout
│   └── modal.tsx
├── components/
│   ├── ui/                 # Reusable UI components
│   └── ...
├── constants/
│   └── theme.ts            # Design tokens & colors
├── hooks/                  # Custom React hooks
├── docs/                   # Diagrams & technical documents
└── app.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Supabase](https://supabase.com) account and project
- [Google AI Studio](https://aistudio.google.com) API key *(for AI pricing)*

### 1. Clone the repository

```bash
git clone https://github.com/Jamaica81828282/SuotMobile.git
cd SuotMobile
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Create a `.env` file in the root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
EXPO_PUBLIC_GEMINI_API_KEY=your-gemini-api-key-here
```

> ⚠️ `.env` is in `.gitignore` — your keys will never be pushed to GitHub.

### 4. Start the app

```bash
npx expo start
```

Then open on your device using:

| Platform | How |
|---|---|
| 📱 Physical device | Scan QR code with [Expo Go](https://expo.dev/go) |
| 🤖 Android | Press `a` for Android emulator |
| 🍎 iOS | Press `i` for iOS simulator |
| 🌐 Web | Press `w` for browser preview |

---

## 💳 Wallet Circulation Rules

| Rule | Detail |
|---|---|
| Active wallet cap | 2,500 pts |
| Overflow | Excess top-up moves to Circulation Buffer automatically |
| Auto-refill | When active pts drop to ≤ 500, buffer refills up to 2,500 |
| Buffer expiry | Circulation buffer expires **30 days** after received |
| Event log | Every transaction is recorded in `wallet_events` |

---

## 📞 Video Call Architecture

Video calls use **native browser WebRTC** with **Supabase Realtime Broadcast** as the signaling channel — no third-party video service, no meeting codes needed. OpenRelay TURN servers are included as fallback for networks where direct P2P is blocked by NAT.

---

## 🤝 Contributing

This project is currently for academic use. Pull requests are welcome for bug fixes and improvements.

1. Fork the repo
2. Create your branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

Academic Use Only — © 2025 Suot

Built for **System Integration & Architecture**

---

<div align="center">
  <sub>Made with 💚 in the Philippines · Tackling SDG 12 one swap at a time</sub>
</div>
