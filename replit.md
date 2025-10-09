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
- **Chat System**: Multi-room chat, private messaging, emoji support, media sharing, chat history notifications.
- **Gift System**: Virtual gifts with real-time display, video gifts, Lottie animations, and Cloudinary integration for media.
- **Gaming Integration**: LowCard bot game with database persistence, automatic refunds, and tie-breaker re-draw system.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API, supporting room and private chat.
- **Credit System**: Virtual currency with transactions and transfers.
- **Social Features**: Friend management, user profiles, ranking systems, activity feeds.
- **Administrative Tools**: Admin panel for moderation, user management, configuration, support ticket management, frame management, user online statistics, and broadcast messaging. Role-based access control and audit logging are implemented.
- **Merchant Recas System**: Monthly revenue requirement system for merchant promotions with automatic downgrade logic and visual status indicators.
- **Help & Support System**: Live chat support with ticket creation, FAQ, and real-time chat status, operating independently from the main chat rooms.
- **Notification System**: Real-time notifications via Socket.IO.
- **User Presence System**: Friends list displays real-time status with smart sorting.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear.
- **Room Connection Persistence**: Maintains user connection across app states with inactivity cleanup and intelligent socket reconnection.
- **Room Capacity Management**: Real-time participant count sync and client-side validation.
- **Video Call System**: Private video/audio calls with Daily.co integration and real-time streaming.
- **Socket Connection Stability**: Enhanced ping/pong heartbeat monitoring, auto-reconnection, exponential backoff, and transport fallback.

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