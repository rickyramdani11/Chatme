# Overview

ChatMe is a cross-platform React Native chat application built with Expo, designed as a comprehensive social messaging platform. It offers real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and gaming features. The application supports iOS, Android, and web, integrating functionalities like AI bot integration, ranking systems, and administrative tools to create a dynamic and engaging social experience. Its ambition is to provide a robust and feature-rich platform for social interaction and entertainment.

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
- **Chat System**: Multi-room chat, private messaging, emoji support, media sharing. Includes anti-flood rate limiting with auto-cooldown. NO message history persistence - rooms start fresh on each join.
- **Gift System**: Virtual gifts with real-time display, video gifts, Lottie JSON animations, and Cloudinary integration. Single gift message rendering with auto-removal (10s) prevents duplicates.
- **Red Packet System**: WeChat-style virtual red envelopes with random credit distribution. UI modal interface for sending packets (minimum 2 users to prevent coin transfer abuse), falling envelope animation for claiming, auto-expiry with refund mechanism, and real-time socket events for broadcast and updates.
- **Gaming Integration**: LowCard bot game, SicboBot (3-dice betting), and BaccaratBot (classic casino card game) with database persistence and multi-player support.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API. Bot ONLY responds in private chat, NOT in public rooms.
- **Credit System**: Virtual currency with transactions and transfers.
- **Social Features**: Friend management, user profiles, ranking systems, activity feeds.
- **Administrative Tools**: Admin panel for moderation, user management, configuration, support ticket management, frame management, user online statistics, and broadcast messaging. Supports admin-created special accounts with custom IDs bypassing OTP.
- **Merchant Recas System**: Monthly revenue requirement system for merchant promotions.
- **Help & Support System**: Live chat support with ticket creation and FAQ.
- **Privacy & Security System**: Privacy settings management with user-scoped access control, data download requests, password/PIN changes.
- **Notification System**: Real-time notifications via Socket.IO for follow and friend add events. Push notifications via Firebase Cloud Messaging (FCM) for private messages when app is in background.
- **User Presence System**: Friends list displays real-time status with smart sorting. Participant auto-removal on leave.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear.
- **Room Connection Persistence**: Maintains user connection across app states with inactivity cleanup and intelligent socket reconnection. Comprehensive socket listener stacking prevention: all 18+ event listeners use socket.off() before socket.on() to ensure single listener attachment, eliminating duplicate event handling.
- **Room Capacity Management**: Real-time participant count sync and client-side validation.
- **Video Call System**: Private video/audio calls with Daily.co integration.
- **Socket Connection Stability**: Enhanced ping/pong heartbeat monitoring, auto-reconnection, exponential backoff, and transport fallback.
- **Info Center**: Displays game commands and merchant/mentor contacts.
- **Push Notifications**: Firebase Cloud Messaging integration for private message notifications when app is backgrounded. Automatic device token registration on login and removal on logout.

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role-based access with super admin whitelist for sensitive operations.
- **Super Admin System**: Whitelist-based access control (SUPER_ADMIN_IDS) for sensitive features. Only whitelisted admin IDs (default: ID 4 - chatme owner) can access: "Tambah Credit", "Ganti Email User", and "Reset Password User". Enforced on both frontend (menu filtering) and backend (API validation).
- **Credential Management Tools**: Super admin-only tools to help users who lose email access: (1) "Ganti Email User" with Gmail/Yahoo domain validation and duplicate email checking, (2) "Reset Password User" with 6-char minimum and bcrypt hashing. Both emit comprehensive audit logs with resource_type and resource_id.
- **Audit Logging**: Comprehensive logging of admin actions with proper schema mapping (resource_type, resource_id). Includes actions: add_credits, change_email, reset_password.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, and path traversal protection.
- **Rate Limiting**: Applied to sensitive operations.
- **PIN Security**: Mandatory PIN for credit transfers.
- **Code Protection**: Hermes engine, ProGuard/R8, auto-backup disabled.

## Process Management & Stability
- **PM2 Configuration**: Dual-process setup for API server (cluster mode) and Gateway (fork mode for Socket.IO). Includes auto-restart, memory limits, and centralized logging.
- **Auto-Recovery**: Application-level crash recovery via PM2.

## UI/UX Decisions
- **Theming**: Dark Mode partially implemented for core screens with ThemeContext, Chatscreen1.tsx uses hardcoded light theme.
- **Level Badges**: Dynamic gradient level badges.
- **Chat Message Display**: Optimized spacing, consistent font sizes, and improved text wrapping. Gift notifications are compact, purple, and auto-disappear. Command messages (/me, /roll, /whois) use dark text (COLORS.text) for visibility on light background, eliminating all dark mode color remnants.
- **Android Back Button**: Hardware back button handling for proper navigation.
- **ProfileScreen Design**: Compact button/badge design, white background, consistent avatar framing, and role badges.
- **Room Management UX**: Increased modal height, participant picker for moderator selection, owner-only moderator adding, functional unban, and smart filtering.

# External Dependencies

## Core Framework & Libraries
- **React Native Ecosystem**: React 19, React Native 0.79, Expo SDK 53.
- **Navigation**: @react-navigation/native.
- **UI/UX**: expo-linear-gradient, @expo/vector-icons, expo-blur, expo-haptics.
- **Media**: expo-image, expo-image-picker, expo-document-picker, expo-av, expo-video, expo-audio.

## Backend Technologies
- **Server**: Express.js v5, Socket.IO v4.7.
- **Database**: PostgreSQL (pg driver).
- **Security**: bcrypt, jsonwebtoken.
- **File Handling**: Multer.
- **Process Manager**: PM2 v6.0.13.
- **AI Integration**: OpenAI SDK with OpenRouter API for Google Gemini 2.5 Flash Lite Preview.

## Platform & Integrations
- **Expo Services**: EAS (Expo Application Services).
- **Storage**: Cloudinary for gift media, avatar frame assets, and feed post media.
- **Video Calls**: Daily.co.
- **Payment Gateway**: Xendit Payout API.

## Game Bots

### BaccaratBot
Classic casino card game with multi-player betting (up to 30 players per game).

**Activation Commands (Admin Only)**:
- `/bot bacarat add` - Activate BaccaratBot in room
- `/bot bacarat off` - Deactivate BaccaratBot in room

**Game Commands**:
- `!start` - Start betting phase (60 second timer)
- `!bet <player/banker/tie> <amount>` - Place bet
  - `player` pays 1:1
  - `banker` pays 0.95:1 (5% commission)
  - `tie` pays 8:1
- `!deal` - Force deal cards (auto-deals after timer)
- `!status` - Check game status
- `!help` - Show commands

**Game Rules**:
- Card values: A=1, 2-9=face value, 10/J/Q/K=0
- Hand value = sum modulo 10 (9 is highest)
- Natural win: 8 or 9 with first 2 cards
- Third card drawn based on fixed Baccarat rules
- Tie: Player/Banker bets push (returned), Tie bets win 8:1
- One bet per user per game (atomic placement prevents duplicates)
- All results logged to `baccarat_games` table with full audit trail

**Visual Features**:
- Card icons displayed using shared `assets/card/` directory (same as LowCard bot)
- Client renders card images via `<card:lc_[rank][suit].png>` tags
- Icons appear in game results and card dealing messages

### SicboBot
3-dice betting game with various bet types and payouts.

### LowCard Bot
Card comparison game with database persistence.