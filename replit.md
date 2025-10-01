# Overview

ChatMe is a cross-platform React Native chat application built with Expo. It provides a comprehensive social messaging platform with real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and gaming features. The application supports iOS, Android, and web platforms, incorporating advanced functionalities like bot integration, ranking systems, and administrative tools.

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
- **Chat System**: Multi-room chat, private messaging, emoji support, media sharing.
- **Gift System**: Virtual gifts with real-time display. Atomic ref-based duplicate send prevention (isSendingGiftRef) prevents race conditions from rapid taps. Batched state updates avoid React useInsertionEffect errors. Alert onDismiss handlers ensure proper cleanup.
- **Chat History Notifications**: iOS/WhatsApp-style red circle indicator for unread private messages. Real-time socket updates show red dot (10px) next to timestamp when new messages arrive. Auto-clears when chat is opened.
- **Gaming Integration**: LowCard bot game.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API (chatme_bot, ID: 43). Uses OpenRouter for better reliability and cost management. Can be added to rooms via `/addbot` command (requires room owner/moderator/admin). Once added, responds to ALL messages in that room. Responds to all messages in private chats with bot. Features: 5-second rate limiting, conversation history context, self-reply prevention, 15-second timeout, room membership tracking, duplicate message prevention. Commands: `/addbot` (add bot to room), `/removebot` (remove bot from room). Bot styling: green username (#167027), blue messages (#0f23bd).
- **Credit System**: Virtual currency with transactions and transfers. Family creation costs 9600 coins with atomic transaction handling.
- **Social Features**: Friend management, user profiles, ranking, activity feeds.
- **Administrative Tools**: Admin panel for moderation, user management, and configuration.
- **Notification System**: Real-time notifications via Socket.IO.
- **User Presence System**: Real-time online/offline status with multi-device support.
- **Device & Location Tracking**: Collects device info (brand, model, OS) and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear.
- **Room Connection Persistence**: Users remain connected to chat rooms across app states with inactivity cleanup and auto-rejoin.
- **Video Call System**: Private video/audio calls with SimpleCallModal UI, incoming call notifications with ringtone (expo-av) and vibration fallback. Call stats tracking (timer, cost calculation, balance checking). Socket-based call signaling (initiate-call, incoming-call, call-response events).

## Data Management
- **Authentication**: JWT tokens in AsyncStorage with refresh.
- **Profile Management**: User profiles with avatars, bio, and photo albums.
- **Media Storage**: Server-side file storage.
- **Transaction Logging**: Audit trail for credit transactions.
- **Game State**: Real-time state management via Socket.IO.

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role verification for admin screens and endpoints.
- **Audit Logging**: Comprehensive admin action logging with sensitive data redaction.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, filename sanitization, path traversal protection.
- **Rate Limiting**: Applied to sensitive operations like credit transfers, emoji, gift, room, and banner operations.
- **PIN Security**: Mandatory PIN for credit transfers; current plaintext storage noted for future encryption.

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
- **Storage**: Local file system (cloud storage planned).
- **Networking**: HTTP/HTTPS, WebSockets.
- **Authentication**: Custom JWT.
- **Push Notifications**: Expo notifications.