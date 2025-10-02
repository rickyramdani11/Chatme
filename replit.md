# Overview

ChatMe is a cross-platform React Native chat application built with Expo. It provides a comprehensive social messaging platform with real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and gaming features. The application supports iOS, Android, and web platforms, incorporating advanced functionalities like bot integration, ranking systems, and administrative tools.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

**October 2, 2025** - Implemented level badge with ImageBackground (lvl_ic.png icon):
- **View-based refactor**: Changed all message structures from Text-based nested to View-based flexDirection:'row' to support ImageBackground (React Native constraint: Image components cannot be nested inside Text)
- **Badge implementation**: ImageBackground 22x24px showing lvl_ic.png with white level number overlaid (fontSize: 12, fontWeight: bold)
- **Message types updated**: Regular messages, command messages, /me commands, gift messages, support messages all use ImageBackground badge
- **Proper alignment**: flexDirection:'row' with alignItems:'center' ensures perfect vertical alignment of badge with username (fontSize 15)
- **Room info structure**: Uses same View-based row structure as regular messages (without badge) for perfect alignment - Text components directly in flexDirection:'row' container
- **Spacing**: marginHorizontal: 3 on badge for proper spacing between username and level
- **Result**: All messages now display level badge as icon with number, badge size matches username height, room info perfectly aligned with usernames

**October 2, 2025** - Chat UI improvements and header redesign:
- **Header redesign**: Moved header elements down (paddingTop: 25px), removed calendar and grid icons for cleaner interface
- **Username size**: Increased senderName fontSize from 14 to 15 for better readability
- **Color consistency**: Room names now use dark orange (#d2691e) consistently across header, room info messages, and join/leave messages
- **Room info NO badge**: Room info messages show only "RoomName: message" without level badge
- **Perfect alignment**: ALL message types use messagesContainer paddingHorizontal: 12 for consistent left alignment
- **Tighter spacing**: Reduced all margins - messageContainer (marginBottom: 4), messageRow (marginVertical: 2), roomInfo (marginBottom: 2), joinLeave (marginVertical: 2, paddingVertical: 4)
- **Result**: Cleaner chat UI with compact spacing, perfect left alignment, consistent room name colors

**October 2, 2025** - Migrated all features to Chatscreen1.tsx (bug-free version):
- **Migration completed**: Moved gift modal, participant modal, and message styling from buggy ChatScreen.tsx to working Chatscreen1.tsx
- **Gift modal**: Atomic ref-based duplicate send prevention (isSendingGiftRef), category tabs, send-to-all toggle, balance display, confirmation alerts
- **Participant modal**: Full participant list with role colors, context menu (View Profile, Private Chat, Kick, Block, Mute, Ban, Lock Room, Report), proper permission checks
- **Message styling**: Support message blue background, bot vs system command differentiation, @mention styling, room_info rendering, video/GIF/image gift support
- **API URL fixes**: Fixed all double `/api/api/...` URLs in Chatscreen1.tsx:
  - Emoji endpoint: `/api/api/emojis` → `/api/emojis`
  - Add participant endpoint: `/api/api/rooms/:id/participants` → `/api/rooms/:id/participants`
  - Load participants endpoint: `/api/api/rooms/:id/participants` → `/api/rooms/:id/participants`
- **Participant management fix**: Removed manual addParticipantToRoom() calls - socket gateway handles participant management automatically on join-room event to prevent conflicts
- **AppNavigator**: Now uses Chatscreen1.tsx (confirmed no duplicate room join bug)
- **Result**: Multi-tab chat works perfectly without duplicates, all features functional

**October 2, 2025** - Fixed duplicate tab creation bug when joining rooms:
- **Root cause**: Race condition in joinSpecificRoom() - multiple calls before setChatTabs completed would create duplicate tabs
- **Fix 1**: Added navigationJoinedRef to prevent useEffect from re-joining same room from navigation params
- **Fix 2**: Added joiningRoomsRef Set to block concurrent joins - prevents duplicate tabs from rapid clicks or dependency re-runs
- **Cleanup**: Properly removes room from joiningRoomsRef on both success and error paths
- **Result**: Only 1 tab created per room, no empty duplicate tabs

**October 2, 2025** - Implemented video gift support (MP4/WebM/MOV):
- **Database schema**: Added media_type, thumbnail_url, duration columns to custom_gifts table
- **Auto-detection**: Backend automatically detects video files (.mp4/.webm/.mov) and sets media_type='video' on upload
- **Unified video detection**: Replaced hardcoded gift name checks with robust mediaType-first + case-insensitive extension fallback
- **Admin UI**: Video indicator badge (videocam icon) shown on gift grid for video gifts
- **Chat rendering**: Video gifts now play correctly with fullscreen animation (not default gift icon)
- **Case-insensitive**: Supports .mp4, .MP4, .Mp4, .webm, .WebM, .mov, .MOV extensions
- **TypeScript**: Added mediaType/thumbnailUrl/duration to Gift interface for type safety
- **API updates**: GET /api/gifts returns mediaType, thumbnailUrl, duration fields for frontend

**October 1, 2025** - Fixed "Girl Car" gift error after admin panel update:
- Renamed duplicate gift ID 15 from "Girl Car 🦁" to "Baby Lion 🦁" to resolve naming conflict
- Added PUT /api/admin/gifts/:id endpoint for proper gift updates (was missing, causing admin confusion)
- Added duplicate name validation to prevent future gift name conflicts (returns 409 error)
- Improved DELETE endpoint to remove both image and animation files (was only deleting animation)
- Fixed gift duplicate display issue with 2-second deduplication window in ChatScreen.tsx

**October 1, 2025** - Integrated Xendit Payout API for withdrawal system:
- **Xendit SDK integrated**: All withdrawal requests now automatically create real payouts in Xendit dashboard
- **Database schema updated**: Added payout_id, xendit_status, xendit_response columns with idempotent migrations
- **Correct API payload**: Uses snake_case (reference_id, channel_code, channel_properties) as required by Xendit
- **Smart channel mapping**: Bank codes (ID_MANDIRI, ID_BCA, etc.) and e-wallet codes (GOPAY, DANA, OVO, etc.)
- **Idempotency protection**: Withdrawal ID used as idempotency key to prevent duplicate payouts
- **Strict validation**: Throws error for unsupported banks/e-wallets (no risky fallback defaults)
- **E-wallet support**: Properly sends phone numbers for GOPAY, DANA, OVO, LINKAJA, SHOPEEPAY
- **Bank support**: Sends account numbers for MANDIRI, BCA, BNI, BRI, CIMB, PERMATA
- **Transaction flow**: Balance deduction → Create payout in Xendit → Save payout_id → Commit (all atomic)
- **Error handling**: Failed Xendit calls saved to DB with error details for admin review

**October 1, 2025** - Fixed withdrawal system errors (null value & foreign key constraint):
- **Issue 1 (null value)**: Added amount_idr column to INSERT statement and CREATE TABLE schema
- **Issue 2 (FK constraint)**: Fixed foreign key pointing to wrong table (user_payout_accounts → user_linked_accounts)
- **Issue 3 (transaction safety)**: Implemented proper transaction handling with dedicated client (pool.connect() instead of pool.query('BEGIN'))
- **Issue 4 (concurrency)**: Atomic balance deduction with WHERE balance >= amount prevents race conditions and double-spend
- **Issue 5 (schema drift)**: Added idempotent FK migration that auto-fixes existing databases (drops wrong FK, adds correct FK to user_linked_accounts)
- Improved error handling: 400 status for insufficient balance (not 500)
- Withdrawal flow now production-safe with ACID guarantees

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
- **Chat System**: Multi-room chat, private messaging, emoji support, media sharing. Room chat messages are real-time only (not persisted) - messages disappear when users leave rooms. Private chat messages are saved to database for history.
- **Gift System**: Virtual gifts with real-time display. Atomic ref-based duplicate send prevention (isSendingGiftRef) prevents race conditions from rapid taps. Duplicate message filtering (2-second window) prevents multiple gift displays from network retries. Batched state updates avoid React useInsertionEffect errors. Alert onDismiss handlers ensure proper cleanup. Room gifts are real-time only.
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
- **Room Connection Persistence**: Users remain connected to chat rooms across app states with inactivity cleanup. Socket reconnection rejoins ONLY the active tab to prevent multi-room auto-join bug. Auto-focus uses hasAutoFocusedRef to prevent repeated setState during navigation. Leave room behavior: server emits "user-left" BEFORE socket.leave() so sender receives their own "has left" message; client delays tab closure 500ms for message visibility.
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