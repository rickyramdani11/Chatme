# Overview

ChatMe is a cross-platform React Native chat application built with Expo, designed as a comprehensive social messaging platform. It offers real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and gaming features. The application supports iOS, Android, and web, integrating functionalities like AI bot integration, ranking systems, and administrative tools to create a dynamic and engaging social experience. Its ambition is to provide a robust and feature-rich platform for social interaction and entertainment.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

## October 10, 2025
- **Dark Mode System - PARTIAL**: Implemented comprehensive dark mode across 9 core screens (SettingsScreen, HomeScreen, RoomScreen, ProfileScreen, EditProfileScreen, FriendsScreen, PrivacySecurityScreen, FeedScreen) with ThemeContext and AsyncStorage persistence.
  - **Pattern**: useTheme hook + useMemo + createThemedStyles function
  - **Dark Mode UI Control**: Menu "Mode Gelap" temporarily hidden in SettingsScreen (commented out) - ThemeContext functionality remains active for other screens
  - **Pending**: AdminScreen and secondary screens can be themed as follow-up
- **Chatscreen1.tsx - LIGHT MODE ONLY (User Request)**: Dark mode implementation REMOVED from Chatscreen1.tsx (active 7669-line production chat screen) per user request. Screen now uses hardcoded light theme colors exclusively:
  - **Implementation**: Removed useTheme hook, useMemo, and ThemeContext dependency
  - **Color System**: Uses local COLORS constant (46 hardcoded light theme values from lightTheme palette) defined outside component function
  - **Styles**: createThemedStyles() function references COLORS constant directly
  - **Coverage**: All colors (background, text, LinearGradient, Ionicons) use hardcoded values - no theme tokens
  - **Helper Functions**: getRoleColor, getRoleBackgroundColor, getLevelBadgeColor use COLORS constant
  - **Gift Picker Modal**: Gray transparent background (`rgba(128, 128, 128, 0.3)`) for gift item cards
  - **Keyboard Auto-Close**: Keyboard automatically closes after sending any message (text, commands, game commands) for better UX
  - **Status**: Zero theme dependencies, functionality preserved
- **Participant Auto-Removal on Leave**: Changed disconnect/leave behavior to completely remove participants from room instead of marking offline:
  - **Backend**: Modified socket disconnect handler to remove user from `roomParticipants` array entirely when they leave
  - **Database Sync**: Participant count automatically synced to database on removal
  - **Frontend**: Participant list and "Currently in room" info automatically updated via `participants-updated` event
  - **Result**: Clean participant list showing only active users, offline users no longer displayed
- **Anti-Flood Rate Limiting System**: Comprehensive protection against message spam from third-party auto-send tools:
  - **Rate Limit**: Maximum 5 messages per 5 seconds per user
  - **Auto-Cooldown**: 30-second mute when limit exceeded
  - **Exempt Roles**: Admin and Mentor users bypass rate limiting
  - **Backend**: Real-time message timestamp tracking with automatic cleanup
  - **Frontend**: Alert notifications for cooldown and exceeded states
  - **Protection**: Prevents flood attacks from automated bots and scripts
- **Admin Special Accounts**: Added ability for admins to create special accounts with custom 1-3 digit IDs that bypass OTP verification. Includes comprehensive validation, audit logging, and auto-verification.

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
- **Chat System**: Multi-room chat, private messaging, emoji support, media sharing, chat history notifications.
- **Gift System**: Virtual gifts with real-time display, video gifts, Lottie JSON animations (with auto-detection), and Cloudinary integration for media. AdminScreen supports JSON file upload via DocumentPicker for Lottie animations.
- **Gaming Integration**: LowCard bot game with database persistence, automatic refunds, and tie-breaker re-draw system.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API, supporting room and private chat.
- **Credit System**: Virtual currency with transactions and transfers.
- **Social Features**: Friend management, user profiles, ranking systems, activity feeds.
- **Administrative Tools**: Admin panel for moderation, user management, configuration, support ticket management, frame management, user online statistics, and broadcast messaging. Role-based access control and audit logging are implemented.
- **Merchant Recas System**: Monthly revenue requirement system for merchant promotions with automatic downgrade logic and visual status indicators.
- **Help & Support System**: Live chat support with ticket creation, FAQ, and real-time chat status, operating independently from the main chat rooms.
- **Privacy & Security System**: Privacy settings management with user-scoped access control, data download requests, password/PIN changes.
- **Notification System**: Real-time notifications via Socket.IO with system notifications for follow and friend add events (e.g., "Andromeda has followed you", "John has added you as a friend").
- **User Presence System**: Friends list displays real-time status with smart sorting.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear.
- **Room Connection Persistence**: Maintains user connection across app states with inactivity cleanup and intelligent socket reconnection.
- **Room Capacity Management**: Real-time participant count sync and client-side validation.
- **Video Call System**: Private video/audio calls with Daily.co integration and real-time streaming.
- **Socket Connection Stability**: Enhanced ping/pong heartbeat monitoring, auto-reconnection, exponential backoff, and transport fallback.
- **Info Center**: Accessible from Settings, displays game commands (LowCard, Bacarat, Sicbo) and merchant/mentor contacts with direct chat navigation and pull-to-refresh.

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role-based access.
- **Audit Logging**: Comprehensive logging of admin actions.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, and path traversal protection.
- **Rate Limiting**: Applied to sensitive operations.
- **PIN Security**: Mandatory PIN for credit transfers.
- **Code Protection**: Hermes engine, ProGuard/R8, auto-backup disabled.

## Process Management & Stability
- **PM2 Configuration**: Dual-process setup for API server (cluster mode) and Gateway (fork mode for Socket.IO). Includes auto-restart, memory limits, and centralized logging.
- **Auto-Recovery**: Application-level crash recovery via PM2.

## UI/UX Decisions
- **Level Badges**: Dynamic gradient level badges.
- **Chat Message Display**: Optimized spacing, consistent font sizes, and improved text wrapping.
- **Emoji/Gift Display**: Standardized sizing.
- **Android Back Button**: Hardware back button handling for proper navigation.
- **PNG Transparency**: Preserved transparency for uploaded images.
- **LowCardBot Card Icons**: Card images rendered from local assets.
- **Auto-Scroll Optimization**: Debounced scroll implementation for lag-free scrolling.
- **Gender Icons**: Visual gender indicators in user profiles.
- **ProfileScreen Design**: Compact button/badge design, white background, consistent avatar framing, and role badges.
- **Album Photo Visibility**: Removed opacity animation to ensure immediate visibility of loaded photos.
- **Profile Background Auto-Refresh**: useFocusEffect with memoized fetch functions ensures profile background updates when returning from EditProfileScreen.
- **Friends Refresh Visual Feedback**: Refresh button shows loading state, disables during fetch, and displays "Loading..." text for clear user feedback.

# External Dependencies

## Core Framework & Libraries
- **React Native Ecosystem**: React 19, React Native 0.79, Expo SDK 53.
- **Navigation**: @react-navigation/native and related navigation libraries.
- **UI/UX**: expo-linear-gradient, @expo/vector-icons, expo-blur, expo-haptics.
- **Media**: expo-image, expo-image-picker, expo-document-picker, expo-av, expo-video, expo-audio.

## Backend Technologies
- **Server**: Express.js v5, Socket.IO v4.7, CORS.
- **Database**: PostgreSQL (pg driver) with connection pooling.
- **Security**: bcrypt, jsonwebtoken.
- **File Handling**: Multer.
- **Process Manager**: PM2 v6.0.13.
- **AI Integration**: OpenAI SDK with OpenRouter API for Google Gemini 2.5 Flash Lite Preview.

## Platform & Integrations
- **Expo Services**: EAS (Expo Application Services).
- **Storage**: Cloudinary for gift media, avatar frame assets, and feed post media.
- **Networking**: HTTP/HTTPS, WebSockets.
- **Authentication**: Custom JWT.
- **Push Notifications**: Expo notifications.
- **Video Calls**: Daily.co (@daily-co/react-native-daily-js, @daily-co/react-native-webrtc, @daily-co/config-plugin-rn-daily-js).
- **Payment Gateway**: Xendit Payout API.
- **Media CDN**: Cloudinary.