# Overview

ChatMe is a cross-platform React Native chat application built with Expo, offering a comprehensive social messaging platform. It includes real-time chat rooms, private messaging, user authentication, a credit system, friend management, media sharing, and gaming features. The application supports iOS, Android, and web, integrating advanced functionalities like bot integration, ranking systems, and administrative tools to create a dynamic and engaging social experience.

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
- **Chat System**: Supports multi-room chat (real-time only, messages not persisted), private messaging (persisted), emoji support, and media sharing.
- **Gift System**: Virtual gifts with real-time display, including video gift support. Features atomic send prevention, duplicate message filtering, and batched state updates.
- **Chat History Notifications**: iOS/WhatsApp-style unread message indicators for private chats.
- **Gaming Integration**: Includes a LowCard bot game.
- **AI Bot Integration**: ChatMe Bot powered by Google Gemini 2.5 Flash Lite Preview via OpenRouter API, supporting room and private chat interactions with rate limiting, conversation history, and specific commands (`/addbot`, `/removebot`).
- **Credit System**: Virtual currency with transactions and transfers, including atomic handling for operations like family creation.
- **Social Features**: Friend management, user profiles, ranking systems, and activity feeds.
- **Administrative Tools**: Admin panel for moderation, user management, and configuration with access control and audit logging.
- **Notification System**: Real-time notifications via Socket.IO.
- **User Presence System**: Real-time online/offline status with multi-device support.
- **Device & Location Tracking**: Collects device information and city/country level location.
- **Avatar Customization**: Frame rental system with auto-expiry and headwear.
- **Room Connection Persistence**: Maintains user connection to chat rooms across app states with inactivity cleanup and intelligent socket reconnection.
- **Video Call System**: Private video/audio calls with SimpleCallModal UI, incoming call notifications, call stats tracking, and socket-based signaling.

## Security & Admin Enhancements
- **Admin Access Control**: Frontend and backend role-based access.
- **Audit Logging**: Comprehensive logging of admin actions with sensitive data redaction.
- **File Upload Security**: Base64 validation, size limits, MIME type filtering, filename sanitization, and path traversal protection.
- **Rate Limiting**: Applied to sensitive operations.
- **PIN Security**: Mandatory PIN for credit transfers (currently plaintext, slated for future encryption).

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
- **Payment Gateway**: Xendit Payout API for withdrawal system.

# Recent Changes

**October 3, 2025** - Enhanced Chatscreen1 UI with gradient level badges and optimized spacing:
- **Level badge redesign**: Replaced text-based "(Lv.X)" with gradient View component with heart icon
  - Format: `chatme: [♥ Lv.X] : message` - badge positioned between username and message
  - Green to blue solid gradient background (Level 1 → Level 10+)
  - Ultra-compact size: fontSize 7, borderRadius 6, heart icon size 6
  - Applied to: Regular messages, support messages
- **Room info text wrapping**: Fixed alignment - text now wraps inline with room name (sejajar)
- **Message spacing optimization**: Reduced marginBottom from 4px to 2px for tighter conversation flow
- **Consistent badge UX**: All screens now use same gradient color logic for visual progression
- **Result**: Cleaner chat interface with better visual hierarchy and reduced whitespace

**October 3, 2025** - Implemented green-to-blue gradient for level badges:
- **Change**: Level badge colors now dynamically change from green (Level 1) to blue (Level 10+) to show progression
- **Color logic**: 
  - Levels 1-9: Gradient interpolation from green (#4CAF6B) to blue (#2196F3)
  - Level 10+: Full blue color (#2196F3)
- **Background colors**: 
  - Levels 1-3: Light green tint (#F0FFF4)
  - Levels 4-6: Medium green tint (#E8F5E9)
  - Levels 7-9: Light blue tint (#E1F5FE)
  - Level 10+: Blue tint (#E3F2FD)
- **Screens updated**: FeedScreen, HomeScreen, PrivateChatScreen
- **Result**: Visual progression system that encourages users to reach Level 10 for full blue badge

**October 3, 2025** - Reverted level badge system to original text-based badges (except Chatscreen1):
- **Change**: User requested rollback - only Chatscreen1 (room chat) uses level badge icons, all other screens reverted to text
- **Screens with TEXT badges**: FeedScreen (heart + "Lv.X"), HomeScreen ("Lv.X"), PrivateChatScreen ("Lv.X")
- **Screen with ICON badges**: Chatscreen1 (room chat only) - uses lvl_1.png through lvl_9.png for join/leave/gift/command messages
- **Reason**: User preference to keep original design for Feed, Home, and Private chat; only room chat uses visual icon system
- **Result**: Hybrid approach - dynamic level icons in room chat, classic text badges everywhere else

**October 3, 2025** - Fixed room info "managed by" field name mismatch:
- **Issue**: Room info showed "managed by admin" instead of actual room creator
- **Root cause**: Code used camelCase (`managedBy`, `createdBy`) but API sends snake_case (`managed_by`, `created_by`)
- **Fix**: Changed `roomData?.managedBy` to `roomData?.managed_by` and `createdBy` to `created_by`
- **Location**: src/screens/Chatscreen1.tsx lines 594, 624
- **Result**: Room info now correctly displays "This room is managed by chatme" for Jakarta room

**October 3, 2025** - Fixed text wrapping alignment in chat messages:
- **Issue fixed**: Pesan panjang yang wrap ke baris kedua tidak sejajar dengan username
- **Solution**: 
  - Separated username+badge+colon into fixed-width container (flexShrink: 0)
  - Message content in flex: 1 Text component with flexWrap: 'wrap'
  - Changed alignItems from 'center' to 'flex-start' for proper top alignment
- **Result**: Multi-line messages now wrap and align perfectly with username position
- **Format**: `chatme(badge): halo apa kabar saya tes\n               pesan ini menyambung`

**October 3, 2025** - Hybrid emoji composer with preview queue:
- **Change**: Implemented two-path emoji system - text emojis to TextInput, image emojis to preview queue
- **Preview area**: Horizontal scrollable strip shows queued image emojis (32x32) with X remove buttons
- **Composition**: Users can type text emojis directly, add image emojis to queue, then send combined message
- **Merging logic**: handleSendMessage merges text input + queued emoji tags (space-separated)
- **All emojis**: Render consistently at 16x16 in chat messages via inlineEmojiImage style
- **UX improvement**: Solves React Native TextInput limitation (can't display inline images) with hybrid approach
- **Location**: src/screens/Chatscreen1.tsx - selectedImageEmojis state, handleEmojiSelect routing, preview UI
- **Verified working**: Gateway logs show successful text+image emoji combinations like "😚 <localimg:Very Happy>"

**October 3, 2025** - Standardized gift earning distribution:
- **Change**: Public room gift earnings aligned with private chat earnings
- **Previous**: Private 30%/70%, Public 70%/30% (user/system split)
- **New**: All gifts 30% to user, 70% to system (consistent across private and public)
- **Location**: server/index.js gift purchase endpoint
- **Reason**: Business decision to standardize revenue split

**October 3, 2025** - Enlarged gift item display size:
- **Issue fixed**: Gift items dari assets/gift/image terlalu kecil saat ditampilkan di room
- **User clarification**: Ini bukan emoji picker, tapi gift items (Little Mermaid, Dolphin, dll)
- **Solution**: 
  - Increased smallGiftImage size from 60x70 to 120x140 pixels (doubled)
  - Adjusted position from top:45% left:45% to top:50% left:50% with marginLeft:-60 marginTop:-70 for true centering
- **Result**: Gift items sekarang lebih besar, centered di semua screen sizes, dan jelas terlihat saat animation

**October 3, 2025** - Fixed emoji size in input field:
- **Issue fixed**: Emoji di input field terlalu besar karena fontSize: 16
- **Solution**: Reduced textInput fontSize from 16 to 14
- **Result**: Emoji dalam input field sekarang sama ukurannya dengan emoji default

**October 3, 2025** - Enlarged gift/emoji display in chat messages:
- **Issue fixed**: Gift images (Panda, Mermaid, dll) terlalu kecil di chat messages
- **User feedback**: Gift perlu lebih besar agar jelas terlihat di chat room
- **Solution**: 
  - Smart detection: Detects standalone gift images vs inline text emojis
  - Standalone gifts: 64x64 pixels (giftImageInChat style) - clearly visible
  - Inline emojis: 16x16 pixels (inlineEmojiImage style) - normal size
- **Result**: Gift images now clearly visible at 64x64 without breaking inline emoji layout

**October 3, 2025** - Join/leave message font size consistency:
- **Issue fixed**: "Jakarta developer has entered" had inconsistent font sizes (Jakarta=13, developer=13, has entered=15)
- **Solution**: Increased roomNameText and usernameText fontSize from 13 to 15
- **Result**: All text in join/leave messages now consistent at fontSize 15 (room name, username, action text)

**October 3, 2025** - Image emoji auto-send & local emoticon integration:
- **Image emoji behavior**: Tap image emoji (dari assets/emoticon) langsung terkirim ke room tanpa muncul di input text
- **Text emoji behavior**: Tap text emoji (😀😂🥰 dll) masuk ke input text seperti biasa
- **Total emoji**: 151 emoji tersedia (89 text + 62 custom image dari assets/emoticon)
- **UX improvement**: Tidak ada lagi placeholder text `<localimg:Sleeping>` - gambar emoji langsung terkirim ke chat
- **Local emoticons**: Semua 62 emoticon dari folder assets/emoticon berhasil dimuat ke emoji picker

**October 3, 2025** - Fixed room info "managed by" display:
- **Root cause**: ID type mismatch in roomData lookup - `r.id === roomId` failed when types differ
- **Fix**: Changed to `r.id.toString() === roomId.toString()` for reliable string comparison
- **Database verified**: All rooms have correct `managed_by` and `created_by` fields
- **Result**: Room info now correctly displays "This room is managed by [actual creator]" instead of hardcoded "admin"