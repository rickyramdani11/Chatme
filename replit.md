# Overview

ChatMe is a cross-platform React Native chat application (iOS, Android, web) designed as a comprehensive social messaging platform. It offers real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and integrated gaming features. The application aims to provide a dynamic and engaging social experience with functionalities like AI bot integration, ranking systems, and administrative tools, serving as a robust platform for social interaction and entertainment.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React Native with Expo SDK
- **Navigation**: React Navigation
- **State Management**: Context API (AuthContext)
- **UI Components**: Custom components leveraging LinearGradient and Ionicons
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
- **Chat System**: Multi-room chat, private messaging, emoji support, media sharing, anti-flood rate limiting.
- **Gift System**: Virtual gifts with real-time display, video gifts, Lottie JSON animations, and Cloudinary integration. Private chat gift notifications persist, while room chat notifications are ephemeral.
- **Red Packet System**: WeChat-style virtual red envelopes with random credit distribution, auto-expiry, and real-time socket events.
- **Gaming Integration**: LowCard, Sicbo, and Baccarat bot games with database persistence and multi-player support.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API for private chats.
- **Credit System**: Virtual currency with secure transactions and transfers, protected by PostgreSQL row-level locking.
- **Social Features**: Friend management, user profiles, ranking systems, activity feeds with EXP/leveling, and automatic coin rewards.
- **Administrative Tools**: Admin panel for moderation, user management, configuration, support tickets, frame management, online statistics, broadcast messaging, and mentor top-up statistics. Includes super admin whitelist for sensitive operations.
- **Merchant/Mentor TOP UP System**: Monthly subscription-based system with dedicated panels for traffic statistics and transaction history, utilizing role-based access control.
- **Help & Support System**: Live chat support with ticket creation, FAQ, and real-time admin notifications.
- **Privacy & Security System**: Privacy settings, data download requests, password/PIN changes.
- **Notification System**: Real-time Socket.IO for social events and FCM for background private messages.
- **User Presence System**: Real-time status display and participant auto-removal.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear, supporting static images and Lottie JSON.
- **Room Connection Persistence**: Intelligent socket reconnection, inactivity cleanup, and single listener attachment.
- **Room Capacity Management**: Real-time participant count sync and client-side validation.
- **Room Lock/Password Protection**: Room owners can lock/unlock rooms using chat commands with password hashing and custom modal for secure input.
- **Private Communication Types**: Distinct channels for 1-on-1 private chat and live admin support.
- **Socket Connection Stability**: Heartbeat monitoring, auto-reconnection, exponential backoff, and transport fallback.
- **Socket Authentication Security**: All client-side socket.emit('sendMessage') calls use authenticated user's username as sender. Room commands (`/lock`, `/ban`) properly validated against socket.username to prevent spoofed system messages.
- **Info Center**: Displays game commands and merchant/mentor contacts.
- **Withdrawal System**: Manual admin-managed system with approval workflow, database transactions, row-level locking, real-time exchange rates, and duplicate account number validation.
- **Referral/Invite System**: User invite system with unique codes, bonus credits for referrers after invited user's first withdrawal, and detailed referral tracking UI.

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role-based access with `ensureAdmin` middleware and super admin whitelist.
- **Credential Management Tools**: Super admin-only tools for email changes and password resets with validation and audit logging.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, and path traversal protection.
- **Rate Limiting**: Applied to sensitive operations.
- **PIN Security**: Mandatory PIN for credit transfers.
- **Feed Endpoint Security**: All feed mutating operations require JWT authentication.
- **Code Protection**: Hermes engine, ProGuard/R8, auto-backup disabled.
- **Race Condition Protection**: All credit operations, red packet refunds, admin room deletions, user registrations, private chat creations, feed operations, EXP system, and withdrawal processes utilize PostgreSQL row-level locking or atomic transactions/UPSERTs to ensure data integrity.
- **Gmail Normalization**: Normalizes Gmail addresses during registration and lookup to prevent duplicate accounts and ensure consistent user matching.
- **User Identity Consistency**: Consistent use of `req.user.userId` from JWT for user identification across private chat and credit endpoints.

## Process Management & Stability
- **PM2 Configuration**: Dual-process setup for API server (cluster mode) and Gateway (fork mode) with auto-restart, memory limits, and centralized logging.
- **Memory Leak Prevention**: Socket gateway implements periodic cleanup for various broadcast tracking Maps to prevent unbounded memory growth.

## UI/UX Decisions
- **Theming**: Partially implemented Dark Mode.
- **Password Validation**: Flexible password validation (6-12 characters).
- **Gift Picker UI**: Grid layout with actual gift images and centered modal.
- **Gift Sending UX**: Non-blocking gift sending experience.
- **Gift Notification Display**: Enhanced visual display of gift messages in chat.
- **Level Badges**: Dynamic gradient level badges.
- **Chat Message Display**: Optimized spacing, consistent fonts, and improved text wrapping.
- **Android Back Button**: Proper hardware back button handling.
- **ProfileScreen Design**: Compact design with consistent framing and role badges.
- **Room Management UX**: Enhanced modal, participant picker for moderator selection, and real-time moderator role updates via sockets.
- **HomeScreen**: Displays accurate active user data.

# External Dependencies

## Core Framework & Libraries
- **React Native Ecosystem**: React, React Native, Expo SDK.
- **Navigation**: @react-navigation/native.
- **UI/UX**: expo-linear-gradient, @expo/vector-icons, expo-blur, expo-haptics.
- **Media**: expo-image, expo-image-picker, expo-document-picker, expo-av, expo-video, expo-audio.

## Backend Technologies
- **Server**: Express.js, Socket.IO.
- **Database**: PostgreSQL (pg driver).
- **Security**: bcrypt, jsonwebtoken.
- **File Handling**: Multer.
- **Process Manager**: PM2.
- **AI Integration**: OpenAI SDK with OpenRouter API.

## Platform & Integrations
- **Expo Services**: EAS (Expo Application Services).
- **Storage**: Cloudinary for media assets.
- **Payment Gateway**: Xendit Payout API.
- **Push Notifications**: Firebase Cloud Messaging (FCM).

## Game Bots
- **BaccaratBot**
- **SicboBot**
- **LowCard Bot**