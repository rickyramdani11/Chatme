# Overview

ChatMe is a cross-platform React Native chat application built with Expo, designed to be a comprehensive social messaging platform. It offers real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and gaming features. The application supports iOS, Android, and web, integrating functionalities like AI bot integration, ranking systems, and administrative tools to create a dynamic and engaging social experience. Its ambition is to provide a robust and feature-rich platform for social interaction and entertainment.

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
- **Chat System**: Multi-room chat (real-time only), private messaging (persisted), emoji support, media sharing, chat history notifications, hybrid emoji composer.
- **Gift System**: Virtual gifts with real-time display, video gifts, atomic send prevention, duplicate message filtering, batched state updates. Gift earnings are standardized to 30% user / 70% system. Cloud storage integration with Cloudinary for scalable gift media management.
- **Gaming Integration**: LowCard bot game with database persistence, automatic refund system, auto-advance feature (instantly proceeds to "Times up" when all players draw cards, no need to wait for 20s timer), and tie-breaker re-draw system (when multiple players have the same lowest card, only those tied players re-draw until there's a clear loser, without affecting other players or moving to the next round).
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API, supporting room and private chat with rate limiting and conversation history.
- **Credit System**: Virtual currency with transactions and transfers.
- **Social Features**: Friend management, user profiles, ranking systems, activity feeds.
- **Administrative Tools**: Admin panel for moderation, user management, configuration, support ticket management, frame management with full CRUD operations, and user online statistics dashboard. All admin actions protected by role-based access control, rate limiting, and comprehensive audit logging. Frame management includes Cloudinary upload support for PNG/GIF assets with file validation (5MB limit). User statistics dashboard displays total registered users, currently online users, and 30-day registration trends. Support ticket system features auto-generated ticket IDs (format: TICK-{timestamp}-{random}), proper SQL joins for admin ticket listing with message counts, and consistent API response mapping (database `message` column mapped to `description` in API responses). Admin screen uses unique composite keys (user-status-${id}-${index}) to prevent React duplicate key warnings.
- **Help & Support System**: Live chat support with support ticket creation, FAQ categories, and real-time chat status. Token authentication properly sourced from AuthContext (token variable, not user.token) to prevent "invalid token format" errors. Live chat uses **independent chat system** (support_chat_messages table) completely separate from rooms - NO room creation, avoiding max_user relation errors. Sessions auto-close stale connections and assign available online admins (fallback to "Support"). Dedicated endpoints: GET/POST /api/support/live-chat/:sessionId/messages for messaging.
- **Notification System**: Real-time notifications via Socket.IO.
- **User Presence System**: Real-time online/offline status with multi-device support.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear.
- **Room Connection Persistence**: Maintains user connection across app states with inactivity cleanup and intelligent socket reconnection.
- **Room Capacity Management**: Real-time participant count sync to database (rooms.members column) on join/leave events. Client-side validation prevents joining full rooms with user-friendly alerts.
- **Video Call System**: Private video/audio calls with Daily.co integration, real-time streaming, global incoming call notifications, call stats tracking, socket-based signaling.
- **Socket Connection Stability**: Enhanced ping/pong heartbeat monitoring with unlimited auto-reconnection (reconnectionAttempts: Infinity), exponential backoff retry strategy, comprehensive disconnect reason logging, automatic transport fallback (WebSocket ↔ Polling), and connection state recovery. Server-side ping interval: 25s, ping timeout: 60s.

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role-based access.
- **Audit Logging**: Comprehensive logging of admin actions.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, filename sanitization, path traversal protection.
- **Rate Limiting**: Applied to sensitive operations.
- **PIN Security**: Mandatory PIN for credit transfers.
- **Code Protection**: Hermes engine for JavaScript bytecode compilation, ProGuard/R8 for Android native code obfuscation, auto-backup disabled to prevent sensitive data leakage to cloud storage.

## Process Management & Stability
- **PM2 Configuration**: Dual-process setup with API server (port 5000) in cluster mode with 2 instances for load balancing, and Gateway (port 8000) in fork mode with 1 instance due to Socket.IO stateful requirements. Auto-restart on crash (max 10 restarts with 4s delay), memory limits (1.5GB per process), and centralized logging to ./logs/ directory.
- **Auto-Recovery**: Application-level crash recovery via PM2. Note: Reserved VM deployment does not auto-restart on VM-level crashes; consider Autoscale deployment for full auto-recovery.
- **Monitoring Commands**: npm scripts for status checking (pm2:status), log viewing (pm2:logs), real-time monitoring (pm2:monit), and service management (pm2:start/stop/restart).
- **Socket.IO Clustering**: Gateway uses single instance (fork mode) to maintain Socket.IO session state. For multi-instance Socket.IO, implement Redis adapter with sticky sessions.

## UI/UX Decisions
- **Level Badges**: Dynamic gradient level badges (green to blue), with icon badges in chat rooms and text badges elsewhere.
- **Chat Message Display**: Optimized message spacing, consistent font sizes for join/leave messages, improved text wrapping alignment.
- **Emoji/Gift Display**: Standardized emoji sizing in input fields and chat messages (16x16 for inline emojis, 64x64 for standalone gift images).
- **Android Back Button**: Hardware back button handling implemented at top-level with navigationRef.canGoBack() to properly navigate stack history or exit app at root, preventing blank screen issues.
- **PNG Transparency**: Transparent PNG uploads preserved with quality: 1.0 in ImagePicker and explicit backgroundColor: 'transparent' on all gift image containers and Image components to prevent alpha channel loss.
- **LowCardBot Card Icons**: Card images rendered from local bundled assets (assets/card/) with CARD_IMAGES mapping using require(), 20x28 pixel size. Command messages use View container with flexDirection: 'row' to render text (wrapped in Text) and card images (wrapped in transparent View) as siblings, avoiding React Native's Image-in-Text restriction. Copy message functionality strips `<card:...>` tags for clean copied text.
- **Auto-Scroll Optimization**: Debounced scroll implementation with 50ms delay and animated:false for instant, lag-free scrolling. Uses dedicated scrollToBottom helper function to prevent multiple redundant scroll calls, improving chat room performance and reducing UI lag.
- **Gender Icons**: Visual gender indicators displayed next to username in ProfileScreen using toilet-style icons (24x24px). Blue icon for male, pink icon for female from assets/gender/ folder. Backend API returns gender field from users table.
- **ProfileScreen Design**: Compact button/badge design with purple-red gradient (#9333ea → #dc2626) for Follow, Message buttons and Family Badge. Button sizes reduced (padding: 18px/10px, fontSize: 14px, icons: 16px). Album section protected from over-scrolling with ScrollView bounces disabled and contentContainerStyle paddingBottom: 40px. Username displays with level badge as small capsule gradient badge (purple-red gradient, paddingHorizontal: 8px, paddingVertical: 3px, borderRadius: 10px, fontSize: 10px) positioned next to username with marginLeft: 6px. Avatar rendering fixed by separating username and level badge as sibling elements (not nested Text).

# External Dependencies

## Core Framework & Libraries
- **React Native Ecosystem**: React 19, React Native 0.79, Expo SDK 53.
- **Navigation**: @react-navigation/native, @react-navigation/stack, @react-navigation/bottom-tabs, @react-navigation/material-top-tabs.
- **UI/UX**: expo-linear-gradient, @expo/vector-icons, expo-blur, expo-haptics.
- **Media**: expo-image, expo-image-picker, expo-document-picker, expo-av, expo-video, expo-audio.

## Backend Technologies
- **Server**: Express.js v5, Socket.IO v4.7, CORS.
- **Database**: PostgreSQL (pg driver) with optimized connection pooling (max: 20, min: 2, idle timeout: 30s).
- **Security**: bcrypt, jsonwebtoken.
- **File Handling**: Multer.
- **Process Manager**: PM2 v6.0.13 for auto-restart, memory management, and process monitoring.
- **AI Integration**: OpenAI SDK with OpenRouter API (https://openrouter.ai/api/v1) for ChatMe Bot using Google Gemini 2.5 Flash Lite Preview model.

## Platform & Integrations
- **Expo Services**: EAS (Expo Application Services).
- **Storage**: Cloudinary cloud storage for gift media (images/videos/GIFs), avatar frame assets (PNG/GIF), and feed post media (photos/videos). Cloud-first storage with automatic CDN delivery.
- **Networking**: HTTP/HTTPS, WebSockets.
- **Authentication**: Custom JWT.
- **Push Notifications**: Expo notifications.
- **Video Calls**: Daily.co (@daily-co/react-native-daily-js, @daily-co/react-native-webrtc@124.0.6-daily.1, @daily-co/config-plugin-rn-daily-js).
- **Payment Gateway**: Xendit Payout API for withdrawal system.
- **Media CDN**: Cloudinary for gift asset hosting and delivery.