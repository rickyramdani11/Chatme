# Overview

ChatMe is a cross-platform React Native chat application built with Expo, offering a comprehensive social messaging platform. It includes real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and gaming features. The application supports iOS, Android, and web, integrating advanced functionalities like bot integration, ranking systems, and administrative tools to create a dynamic and engaging social experience.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React Native with Expo SDK 53
- **Navigation**: React Navigation v7
- **State Management**: Context API (AuthContext)
- **UI Components**: Custom components with LinearGradient, Ionicons
- **Platform Support**: iOS, Android, and web
- **Media Handling**: Expo Image Picker, Document Picker, AV/Video
- **Local Storage**: AsyncStorage

## Backend
- **Server**: Express.js with Socket.IO for real-time communication
- **Database**: PostgreSQL
- **Authentication**: JWT with bcrypt
- **File Upload**: Multer
- **API**: RESTful endpoints with Bearer token authorization

## Core Features
- **Chat System**: Supports multi-room chat (real-time only, messages not persisted), private messaging (persisted), emoji support, and media sharing.
- **Gift System**: Virtual gifts with real-time display, including video gift support. Features atomic send prevention, duplicate message filtering, and batched state updates.
- **Chat History Notifications**: iOS/WhatsApp-style unread message indicators for private chats.
- **Gaming Integration**: Includes a LowCard bot game.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API, supporting room and private chat interactions with rate limiting, conversation history, and specific commands (`/addbot`, `/removebot`).
- **Credit System**: Virtual currency with transactions and transfers, including atomic handling for operations like family creation.
- **Social Features**: Friend management, user profiles, ranking systems, and activity feeds.
- **Administrative Tools**: Admin panel for moderation, user management, and configuration with access control and audit logging.
- **Notification System**: Real-time notifications via Socket.IO.
- **User Presence System**: Real-time online/offline status with multi-device support.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear.
- **Room Connection Persistence**: Maintains user connection to chat rooms across app states with inactivity cleanup and intelligent socket reconnection.
- **Video Call System**: Private video/audio calls with SimpleCallModal UI, incoming call notifications, call stats tracking, and socket-based signaling.

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role-based access.
- **Audit Logging**: Comprehensive logging of admin actions with sensitive data redaction.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, filename sanitization, and path traversal protection.
- **Rate Limiting**: Applied to sensitive operations.
- **PIN Security**: Mandatory PIN for credit transfers (currently plaintext, slated for future encryption).

# External Dependencies

## Core Framework & Libraries
- **React Native Ecosystem**: React 19, React Native 0.79, Expo SDK 53.
- **Navigation**: @react-navigation/native, @react-navigation/stack, @react-navigation/bottom-tabs, @react-navigation/material-top-tabs.
- **UI/UX**: expo-linear-gradient, @expo/vector-icons, expo-blur, expo-haptics.
- **Media**: expo-image, expo-image-picker, expo-document-picker, expo-av, expo-video, expo-audio.

## Backend Technologies
- **Server**: Express.js v5, Socket.IO v4.7, CORS.
- **Database**: PostgreSQL (pg driver).
- **Security**: bcrypt, jsonwebtoken.
- **File Handling**: Multer.
- **AI Integration**: OpenAI SDK with OpenRouter API (https://openrouter.ai/api/v1) for ChatMe Bot using Google Gemini 2.5 Flash Lite Preview model.

## Platform & Integrations
- **Expo Services**: EAS (Expo Application Services).
- **Storage**: Local file system.
- **Networking**: HTTP/HTTPS, WebSockets.
- **Authentication**: Custom JWT.
- **Push Notifications**: Expo notifications.
- **Payment Gateway**: Xendit Payout API for withdrawal system.

# Recent Changes

**October 3, 2025** - Fixed emoji size in input field:
- **Issue fixed**: Emoji di input field terlalu besar karena fontSize: 16
- **Solution**: Reduced textInput fontSize from 16 to 14
- **Result**: Emoji dalam input field sekarang sama ukurannya dengan emoji default

**October 3, 2025** - Enlarged gift emoji display size with smart detection:
- **Issue fixed**: Gift emojis (🧜‍♀️ dll) terlalu kecil saat ditampilkan di room chat
- **Smart detection**: Auto-detects standalone gift images vs inline text emojis using regex `/^<(img|localimg):[^>]+>$/`
- **Solution**: 
  - Standalone gifts: 50x50 pixels (standaloneGiftImage style)
  - Inline text emojis: 18x18 pixels (inlineEmojiImage style)
- **Result**: Gift images clearly visible at 50x50 without breaking inline emoji layout

**October 3, 2025** - Join/leave message font size consistency:
- **Issue fixed**: "Jakarta developer has entered" had inconsistent font sizes (Jakarta=13, developer=13, has entered=15)
- **Solution**: Increased roomNameText and usernameText fontSize from 13 to 15
- **Result**: All text in join/leave messages now consistent at fontSize 15 (room name, username, action text)

**October 3, 2025** - Image emoji auto-send & local emoticon integration:
- **Image emoji behavior**: Tap image emoji (dari assets/emoticon) langsung terkirim ke room tanpa muncul di input text
- **Text emoji behavior**: Tap text emoji (😀😂🥰 dll) masuk ke input text seperti biasa
- **Total emoji**: 151 emoji tersedia (89 text + 62 custom image dari assets/emoticon)
- **UX improvement**: Tidak ada lagi placeholder text `<localimg:Sleeping>` - gambar emoji langsung terkirim ke chat
- **Local emoticons**: Semua 62 emoticon dari folder assets/emoticon berhasil dimuat ke emoji picker

**October 3, 2025** - Fixed room info "managed by" display:
- **Root cause**: ID type mismatch in roomData lookup - `r.id === roomId` failed when types differ
- **Fix**: Changed to `r.id.toString() === roomId.toString()` for reliable string comparison
- **Database verified**: All rooms have correct `managed_by` and `created_by` fields
- **Result**: Room info now correctly displays "This room is managed by [actual creator]" instead of hardcoded "admin"