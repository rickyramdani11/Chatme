# Overview

ChatMe is a cross-platform React Native chat application (iOS, Android, web) designed as a comprehensive social messaging platform. It offers real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and integrated gaming features. The application aims to provide a dynamic and engaging social experience with functionalities like AI bot integration, ranking systems, and administrative tools. Its core purpose is to be a robust platform for social interaction and entertainment.

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
- **Chat System**: Multi-room chat, private messaging, emoji support, media sharing. Features anti-flood rate limiting and no message history persistence.
- **Gift System**: Virtual gifts with real-time display, video gifts, Lottie JSON animations, and Cloudinary integration.
- **Red Packet System**: WeChat-style virtual red envelopes with random credit distribution, UI modal for sending, falling envelope animation for claiming, auto-expiry, and real-time socket events.
- **Gaming Integration**: LowCard bot game, SicboBot, and BaccaratBot with database persistence and multi-player support.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API, responding only in private chats.
- **Credit System**: Virtual currency with transactions and transfers, protected by PostgreSQL row-level locking to prevent race conditions.
- **Social Features**: Friend management, user profiles, ranking systems, activity feeds.
- **Administrative Tools**: Admin panel for moderation, user management, configuration, support ticket management, frame management, user online statistics, and broadcast messaging. Includes super admin whitelist for sensitive operations like credit top-ups, email changes, and password resets.
- **Merchant/Mentor TOP UP System**: Monthly subscription-based system for mentors and merchants with specific transfer flows and auto-downgrade mechanisms.
- **Help & Support System**: Live chat support with ticket creation, FAQ, and real-time admin notifications via socket.
- **Privacy & Security System**: Privacy settings, data download requests, password/PIN changes.
- **Notification System**: Real-time Socket.IO notifications for social events and Firebase Cloud Messaging (FCM) for private messages when the app is in the background.
- **User Presence System**: Real-time status display in friends list and participant auto-removal.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear, supporting static images and Lottie JSON animations with real-time preview.
- **Room Connection Persistence**: Maintains user connection with inactivity cleanup and intelligent socket reconnection, ensuring single listener attachment for all socket events.
- **Room Capacity Management**: Real-time participant count sync and client-side validation.
- **Video Call System**: Private video/audio calls with Daily.co integration.
- **Socket Connection Stability**: Enhanced ping/pong heartbeat monitoring, auto-reconnection, exponential backoff, and transport fallback.
- **Info Center**: Displays game commands and merchant/mentor contacts.
- **Withdrawal System**: Comprehensive withdrawal management with Xendit integration, real-time exchange rates, minimum thresholds, Indonesian bank support, environment-based API keys, automatic refunds, and full history tracking.

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role-based access with super admin whitelist.
- **Super Admin System**: Whitelist-based access for sensitive features (e.g., credit management, user credential changes).
- **Credential Management Tools**: Super admin-only tools for email changes and password resets with validation and audit logging.
- **Audit Logging**: Comprehensive logging of admin actions.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, and path traversal protection.
- **Rate Limiting**: Applied to sensitive operations.
- **PIN Security**: Mandatory PIN for credit transfers.
- **Code Protection**: Hermes engine, ProGuard/R8, auto-backup disabled.
- **Race Condition Protection**: All credit operations use PostgreSQL row-level locking (SELECT...FOR UPDATE) with explicit transactions to prevent negative balances.

## Process Management & Stability
- **PM2 Configuration**: Dual-process setup for API server (cluster mode) and Gateway (fork mode for Socket.IO) with auto-restart, memory limits, and centralized logging.
- **Auto-Recovery**: Application-level crash recovery via PM2.

## UI/UX Decisions
- **Theming**: Partially implemented Dark Mode.
- **Level Badges**: Dynamic gradient level badges.
- **Chat Message Display**: Optimized spacing, consistent font sizes, improved text wrapping, and distinct display for gift notifications and command messages.
- **Android Back Button**: Hardware back button handling for proper navigation.
- **ProfileScreen Design**: Compact button/badge design, white background, consistent avatar framing, and role badges.
- **Room Management UX**: Increased modal height, participant picker for moderator selection, owner-only moderator adding, functional unban, and smart filtering.
- **Call UI Enhancement**: Video/audio call icons hidden during active calls.

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
- **Push Notifications**: Firebase Cloud Messaging (FCM).

## Game Bots
- **BaccaratBot**: Classic casino card game with multi-player betting.
- **SicboBot**: 3-dice betting game.
- **LowCard Bot**: Card comparison game.