# Overview

ChatMe is a cross-platform React Native chat application built with Expo, offering a comprehensive social messaging platform. It facilitates real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and gaming features. The application supports iOS, Android, and web, integrating advanced functionalities like AI bot integration, ranking systems, and administrative tools to create a dynamic and engaging social experience.

# Recent Changes

**October 4, 2025**
- **LowCard Game Persistence**: Implemented database persistence system to prevent coin loss on server crashes
  - Added `lowcard_games` table to track game state (bet, status, winner, timestamps)
  - Added `lowcard_game_players` table to track player participation and refunds
  - Auto-refund system runs on server startup: detects incomplete games and refunds all players automatically
  - Game state persisted throughout lifecycle: creation → joining → running → finished
  - Coin safety guaranteed: no more coin loss when server restarts during active games
- **LowCard Private Commands**: Made `!start` and `!d` commands private - only visible to command sender
  - Error messages (insufficient balance, game already in progress, etc.) now sent as private messages
  - Prevents spam and keeps user errors confidential
  - Uses `user_{userId}` notification room for private message delivery
- **UI Enhancement**: Redesigned gift message level badge from inline text to small circular badge (18x18) 
  - Changed from `<Text>♥Lv.X</Text>` to circular `<View style={giftLevelCircle}><Text>X</Text></View>` format
  - Added `giftLevelCircle` and `giftLevelText` styles for clean, compact level display
- **CRITICAL FIX**: Resolved private chat 404 error caused by router mounting conflict
  - Problem: withdrawRouter was mounted too broadly at `/api`, intercepting all API routes including `/api/chat/private`
  - Solution: Remounted withdrawRouter at `/api/withdraw` to scope all withdrawal-related endpoints properly
  - Updated WithdrawScreen.tsx to use new withdrawal endpoint paths: `/api/withdraw/exchange-rate`, `/api/withdraw/user/*`
  - Private chat creation at `/api/chat/private` now working correctly
- Fixed critical bug: Added missing `getLevelBadgeColor` helper function to Chatscreen1.tsx (was causing gift message display crashes)
- Verified ParticipantsList fix working correctly with socket gateway architecture
- Removed duplicate private chat endpoints (lines 6033-6279 in server/index.js) to prevent routing conflicts
- **INVESTIGATION**: Duplicate join/leave messages issue requires further analysis - initial fix attempt reverted due to breaking legitimate rejoin broadcasts

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
- **Chat System**: Multi-room chat (real-time only), private messaging (persisted), emoji support, media sharing. Includes chat history notifications and a hybrid emoji composer with a preview queue.
- **Gift System**: Virtual gifts with real-time display, including video gifts, atomic send prevention, duplicate message filtering, and batched state updates. Gift earnings are standardized to 30% user / 70% system.
- **Gaming Integration**: Includes a LowCard bot game with database persistence and automatic refund system to prevent coin loss on server crashes.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API, supporting room and private chat with rate limiting and conversation history.
- **Credit System**: Virtual currency with transactions and transfers.
- **Social Features**: Friend management, user profiles, ranking systems, and activity feeds.
- **Administrative Tools**: Admin panel for moderation, user management, and configuration with access control and audit logging.
- **Notification System**: Real-time notifications via Socket.IO.
- **User Presence System**: Real-time online/offline status with multi-device support.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear.
- **Room Connection Persistence**: Maintains user connection across app states with inactivity cleanup and intelligent socket reconnection.
- **Video Call System**: Private video/audio calls with Agora RTC SDK integration, real-time streaming, global incoming call notifications (works from any screen), call stats tracking, and socket-based signaling with proper accept/decline response handling.

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role-based access.
- **Audit Logging**: Comprehensive logging of admin actions.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, filename sanitization, and path traversal protection.
- **Rate Limiting**: Applied to sensitive operations.
- **PIN Security**: Mandatory PIN for credit transfers.

## UI/UX Decisions
- **Level Badges**: Dynamic gradient level badges (green to blue) indicating user progression, with a hybrid approach where chat rooms use icon badges and other screens use text badges.
- **Chat Message Display**: Optimized message spacing, consistent font sizes for join/leave messages, and improved text wrapping alignment.
- **Emoji/Gift Display**: Standardized emoji sizing in input fields and chat messages (16x16 for inline emojis, 64x64 for standalone gift images).

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
- **Video Calls**: Agora RTC SDK (react-native-agora).
- **Payment Gateway**: Xendit Payout API for withdrawal system.