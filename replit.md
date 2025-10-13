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
- **Gift System**: Virtual gifts with real-time display, video gifts, Lottie JSON animations, and Cloudinary integration. Private chat gift notifications persist to database for permanent history (October 2025). Room chat gift notifications display as permanent messages during session but are ephemeral by design (October 2025). All gift animations standardized to 6-second duration for consistent UX (October 2025). Eliminated duplicate gift events by using single `new-message` event delivery path instead of dual `new-message` + `receive-private-gift` emissions (October 2025).
- **Red Packet System**: WeChat-style virtual red envelopes with random credit distribution, UI modal for sending, falling envelope animation for claiming, auto-expiry with transaction-based refund locking (October 2025), and real-time socket events. Uses Fisher-Yates shuffle for fair distribution (October 2025).
- **Gaming Integration**: LowCard bot game, SicboBot, and BaccaratBot with database persistence and multi-player support.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API, responding only in private chats.
- **Credit System**: Virtual currency with transactions and transfers, protected by PostgreSQL row-level locking to prevent race conditions.
- **Social Features**: Friend management, user profiles, ranking systems, activity feeds with EXP/leveling system and automatic coin rewards.
- **Administrative Tools**: Admin panel for moderation, user management, configuration, support ticket management, frame management, user online statistics, and broadcast messaging. Includes super admin whitelist for sensitive operations like credit top-ups, email changes, and password resets.
- **Merchant/Mentor TOP UP System**: Monthly subscription-based system for mentors and merchants with specific transfer flows and auto-downgrade mechanisms. Includes dedicated panels: MentorScreen displays traffic statistics (total top-ups, merchant count, monthly/all-time totals) with refresh capability; MerchantScreen shows merchant's own statistics (promotion details, top-up totals, monthly progress) with transaction history (October 2025). Both panels use role-based access control and secure parameterized queries.
- **Help & Support System**: Live chat support with ticket creation, FAQ, and real-time admin notifications via socket.
- **Privacy & Security System**: Privacy settings, data download requests, password/PIN changes.
- **Notification System**: Real-time Socket.IO notifications for social events and Firebase Cloud Messaging (FCM) for private messages when the app is in the background.
- **User Presence System**: Real-time status display in friends list and participant auto-removal.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear, supporting static images and Lottie JSON animations with real-time preview.
- **Room Connection Persistence**: Maintains user connection with inactivity cleanup and intelligent socket reconnection, ensuring single listener attachment for all socket events.
- **Room Capacity Management**: Real-time participant count sync and client-side validation.
- **Private Communication Types**: Two distinct private communication channels: (1) Private Chat 1-on-1 with roomId format `private_3_4` for regular user-to-user conversations, (2) Support Chat with `isSupport: true` flag for live admin support sessions (October 2025).
- **Socket Connection Stability**: Enhanced ping/pong heartbeat monitoring, auto-reconnection, exponential backoff, and transport fallback.
- **Info Center**: Displays game commands and merchant/mentor contacts.
- **Withdrawal System**: Manual withdrawal management system bypassing Xendit API (due to business verification requirements). Features admin approval/rejection workflow with database transactions, row-level locking (SELECT FOR UPDATE) to prevent race conditions, atomic balance refunds on rejection, real-time exchange rates, minimum thresholds, Indonesian bank support, full history tracking, and duplicate account number validation across users to prevent spam and irregular coin transactions (October 2025).
- **Referral/Invite System**: User invite system with unique auto-generated invite codes for all users. New users can optionally enter invite code during registration. Referrer receives 10,000 credits bonus automatically after invited user completes their first withdrawal (quality assurance mechanism). Features transaction-based bonus distribution with FOR UPDATE row-level locking to prevent duplicate bonus awards during concurrent withdrawals. Includes InviteFriendsScreen UI with invite code display, copy/share functionality, referral statistics (total invited, total bonus earned, pending bonus), and referral history with status tracking (pending/completed). API endpoints: GET /api/referral/my-code, GET /api/referral/stats, GET /api/referral/history. Backend validates invite codes during registration and creates referral records with status=pending. Bonus triggers only once per referral with database-enforced idempotency (October 2025).

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role-based access with super admin whitelist. ensureAdmin middleware enforces admin-only access for sensitive endpoints (October 2025).
- **Super Admin System**: Whitelist-based access for sensitive features (e.g., add credits, email changes, password resets). Transfer history viewable by all admins (October 2025).
- **Credential Management Tools**: Super admin-only tools for email changes and password resets with validation and audit logging.
- **Audit Logging**: Comprehensive logging of admin actions.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, and path traversal protection.
- **Rate Limiting**: Applied to sensitive operations.
- **PIN Security**: Mandatory PIN for credit transfers.
- **Feed Endpoint Security**: All feed mutating operations (create post, like, comment, share, delete) require JWT authentication (October 2025).
- **Code Protection**: Hermes engine, ProGuard/R8, auto-backup disabled.
- **Race Condition Protection**: All credit operations use PostgreSQL row-level locking (SELECT...FOR UPDATE) with explicit transactions to prevent negative balances. Red packet expiry refunds protected against duplicate credit race conditions (October 2025). Admin delete room operations use transactions to prevent partial deletes and data inconsistency (October 2025). User registration uses database UNIQUE constraint enforcement with error code 23505 handling to prevent concurrent duplicate user creation (October 2025). Private chat creation uses transactions with BEGIN/COMMIT/ROLLBACK to prevent partial inserts across private_chats and private_chat_participants tables (October 2025). Feed system uses atomic UPDATE operations for likes/shares (October 2025). EXP system uses dedicated client connections with guaranteed release on all exit paths to prevent connection pool exhaustion (October 2025). Withdrawal admin operations (approve/reject) use row-level locking (SELECT FOR UPDATE) with transactions to prevent concurrent processing and ensure atomic balance refunds (October 2025).
- **Gmail Normalization**: Registration normalizes Gmail addresses (removes dots) before storage to prevent duplicate accounts. All email-based queries (OTP verification, resend verification, password reset) normalize incoming emails before database lookup to ensure consistent user matching (October 2025).
- **User Identity Consistency**: All private chat endpoints and credit endpoints consistently use `req.user.userId` field from JWT token for user identification, eliminating previous inconsistency between `req.user.id` and `req.user.userId` that caused data corruption (October 2025). Credit operations use atomic UPSERT pattern (INSERT...ON CONFLICT DO UPDATE) for receiver balance updates to prevent race conditions without explicit locks (October 2025).

## Process Management & Stability
- **PM2 Configuration**: Dual-process setup for API server (cluster mode) and Gateway (fork mode for Socket.IO) with auto-restart, memory limits, and centralized logging.
- **Auto-Recovery**: Application-level crash recovery via PM2.
- **Memory Leak Prevention**: Socket gateway implements periodic cleanup for broadcast tracking Maps (October 2025):
  - `pendingBroadcasts`: Cleared on disconnect to prevent orphaned setTimeout timers
  - `recentBroadcasts`: Periodic cleanup every 60s for entries >30s old
  - `recentLeaveBroadcasts`: Periodic cleanup every 60s for entries >30s old
  - `announcedJoins`: Periodic cleanup every 60s for entries >2 hours old
  - Prevents unbounded memory growth from rapid connect/disconnect cycles

## UI/UX Decisions
- **Theming**: Partially implemented Dark Mode.
- **Password Validation**: All characters allowed (letters, numbers, symbols), length 6-12 characters (October 2025).
- **Gift Picker UI**: PrivateChatScreen gift modal displays 3-column grid layout with actual gift images instead of emoji icons. Modal is centered (90% width, 50% height, borderRadius 20) with proper wrapper structure for correct positioning (October 2025).
- **Gift Sending UX**: Removed blocking Alert.alert after gift sent - modal closes immediately to prevent UI freeze and allow gift animation to display properly (October 2025).
- **Gift Notification Display**: Gift messages in private chat now include gift icon/emoji in content (e.g., "chatme send Semangka 🍉 to hana") and gift object data for proper visual rendering (October 2025).
- **Level Badges**: Dynamic gradient level badges.
- **Chat Message Display**: Optimized spacing, consistent font sizes, improved text wrapping, and distinct display for gift notifications and command messages.
- **Android Back Button**: Hardware back button handling for proper navigation.
- **ProfileScreen Design**: Compact button/badge design, white background, consistent avatar framing, and role badges.
- **Room Management UX**: Increased modal height, participant picker for moderator selection, owner-only moderator adding, functional unban, and smart filtering.
- **HomeScreen**: Removed fake active users counter that displayed random numbers instead of real data (October 2025).

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
- **Payment Gateway**: Xendit Payout API.
- **Push Notifications**: Firebase Cloud Messaging (FCM).

## Game Bots
- **BaccaratBot**: Classic casino card game with multi-player betting. Uses row-level locking (SELECT FOR UPDATE) to prevent negative balance race conditions (October 2025).
- **SicboBot**: 3-dice betting game. Protected against concurrent bet race conditions with transaction-based credit deduction (October 2025).
- **LowCard Bot**: Card comparison game. Implements PostgreSQL row-level locking for atomic balance checks and deductions (October 2025).