# Overview

ChatMe is a cross-platform React Native chat application built with Expo. It's a comprehensive social messaging platform featuring real-time chat rooms, private messaging, user authentication, credit system, friend management, media sharing, gaming features, and administrative tools. The app supports multiple platforms (iOS, Android, and web) and includes advanced features like bot integration, ranking systems, and multimedia content sharing.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React Native with Expo SDK 53
- **Navigation**: React Navigation v7 with stack and material top tab navigators
- **State Management**: Context API with AuthContext for user authentication and global state
- **UI Components**: Custom components with LinearGradient, Ionicons, and native React Native components
- **Platform Support**: Universal app supporting iOS, Android, and web platforms
- **Media Handling**: Expo Image Picker and Document Picker for file uploads, Expo AV/Video for media playback
- **Storage**: AsyncStorage for local data persistence

## Backend Architecture
- **Server**: Express.js with Socket.IO for real-time communication
- **Database**: PostgreSQL with connection pooling
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **File Upload**: Multer middleware for handling multipart/form-data
- **Real-time Features**: Socket.IO for live chat, gaming, and notifications
- **API Structure**: RESTful endpoints with Bearer token authorization

## Core Features Architecture
- **Chat System**: Multi-room chat with private messaging, emoji support, and media sharing
- **Gaming Integration**: LowCard bot game with TypeScript/JavaScript dual implementation
- **Credit System**: Virtual currency with transaction history and peer-to-peer transfers
- **Social Features**: Friend management, user profiles, ranking systems, and activity feeds
- **Administrative Tools**: Admin panel for content moderation, user management, and system configuration
- **Notification System**: Real-time notifications for various user interactions
- **User Presence System**: Real-time online/offline status tracking with multi-device support via Socket.IO
- **Device Tracking**: Login device info (brand, model, OS) collected via expo-device with IP tracking
- **Location Tracking**: City/country level location via expo-location with GPS and reverse geocoding
- **Avatar Customization System**: Frame rental system with 14-day auto-expiry and headwear items with auto-equip functionality

## Data Management
- **Authentication Flow**: JWT tokens stored in AsyncStorage with automatic refresh
- **Profile Management**: User profiles with avatars, bio, achievements, and photo albums
- **Media Storage**: Server-side file storage with URL-based access
- **Transaction Logging**: Comprehensive audit trail for all credit transactions
- **Game State**: Real-time game state management through Socket.IO rooms

# External Dependencies

## Core Dependencies
- **React Native Ecosystem**: React 19, React Native 0.79, Expo SDK 53
- **Navigation**: @react-navigation/native, @react-navigation/stack, @react-navigation/bottom-tabs, @react-navigation/material-top-tabs
- **UI/UX**: expo-linear-gradient, @expo/vector-icons, expo-blur, expo-haptics
- **Media**: expo-image, expo-image-picker, expo-document-picker, expo-av, expo-video, expo-audio

## Backend Dependencies
- **Server**: Express.js v5, Socket.IO v4.7, CORS middleware
- **Database**: PostgreSQL with pg driver
- **Security**: bcrypt for password hashing, jsonwebtoken for authentication
- **File Handling**: Multer for file uploads
- **Development**: Nodemon for development server

## Platform Services
- **Expo Services**: EAS (Expo Application Services) for building and deployment
- **Storage**: Local file system for media uploads with planned cloud storage integration
- **Networking**: HTTP/HTTPS with WebSocket support for real-time features

## Third-party Integrations
- **Authentication**: Custom JWT implementation with optional social login capabilities
- **Payment**: Placeholder for payment gateway integration (credit system ready)
- **Push Notifications**: Expo notifications system (implementation ready)
- **Analytics**: Ready for integration with analytics providers

# Security Hardening

## Recent Security Improvements (September 2025)

### Admin Access Control
- **Frontend Protection**: AdminScreen.tsx includes role verification with Alert + navigation.goBack() for unauthorized access
- **Backend Protection**: All admin endpoints require admin role verification via authenticateAdmin middleware
- **JWT Security**: Enforced JWT_SECRET requirement with fail-fast on missing secret to prevent token forgery

### Audit Logging System
- **Comprehensive Tracking**: admin_audit_logs table captures all admin actions
- **Data Captured**: admin_id, username, action, resource_type, resource_id, IP address, user agent, status, error messages
- **Sensitive Field Redaction**: Automatic redaction of password, pin, token, secret, creditCardNumber fields
- **Base64 Redaction**: All base64 image fields (emojiFile, giftImage, bannerImage, imageData) are redacted from logs
- **Coverage**: Applied to admin routes (emoji, gift, room operations), credit transfers, and banner management

### File Upload Security
- **Base64 Validation**: Magic number verification for PNG, JPG, JPEG, GIF, WEBP formats
- **Size Limits**: 10MB maximum for base64 uploads, enforced for all admin operations
- **MIME Type Filtering**: Allowlist-based validation (image/jpeg, image/jpg, image/png, image/webp, image/gif)
- **Filename Sanitization**: Path.basename + regex sanitization + cryptographic random suffix
- **Path Traversal Protection**: Hardcoded safe directories, strict field name validation
- **Coverage**: Emoji uploads, gift image uploads, admin banner uploads

### Rate Limiting
- **Credit Transfer**: 5 requests/minute (critical financial operation)
- **Emoji Operations**: Create 20/min, Delete 10/min
- **Gift Operations**: Create 20/min, Delete 10/min
- **Room Operations**: Delete 5/min
- **Banner Operations**: Create 10/min
- **Implementation**: In-memory store with periodic cleanup (suitable for single instance)

### PIN Security
- **Fallback Removed**: Eliminated '000000' default fallback
- **Required PIN**: Users must set PIN before credit transfers
- **Clear Error Messages**: "PIN not set. Please set your PIN in profile settings"
- **Known Limitation**: PINs currently stored in plaintext (requires bcrypt migration for full production security)

## Security Best Practices Implemented
1. ✅ No client-controlled file paths
2. ✅ MIME type validation with size limits
3. ✅ Sensitive data redaction in audit logs
4. ✅ Rate limiting on all sensitive operations
5. ✅ JWT secret enforcement
6. ✅ Admin role verification at multiple layers
7. ✅ Magic number validation for image uploads

## Known Limitations & Future Work
- **PIN Storage**: Currently plaintext with TODO for bcrypt migration
- **Rate Limiting**: In-memory implementation (consider Redis for distributed deployment)
- **Banner Upload**: MIME-based validation (magic byte check recommended for enhanced security)
- **JWT Secrets**: Default secrets exist in auth.js and socket-gateway.js (requires secure environment variables for production)

## Recent Administrative Improvements (September 2025)

### User Presence & Tracking System
- **Real-Time Online Status**: Socket gateway manages online/offline status based on active WebSocket connections
- **Multi-Device Support**: User status remains 'online' while any device has an active socket connection
- **Logout Handling**: Logout endpoint doesn't change status; gateway exclusively manages presence via socket lifecycle
- **Device Information**: Login captures device brand, model, OS name, and version via expo-device
- **Location Tracking**: GPS coordinates with reverse geocoding to city/country level via expo-location
- **IP Address Tracking**: X-Forwarded-For header capture for login IP tracking
- **Database Schema**: Added device_info, status, last_ip, location, last_login columns to users table
- **Privacy**: Location limited to city/country level, graceful fallbacks for permission denials

### Admin Panel Enhancements
- **Credit History Endpoint**: GET /admin/credits/history/:userId returns transaction history with proper JOIN and mapping
- **User Status Endpoint**: GET /admin/users/status returns comprehensive user data (id, username, email, phone, role, status, credits, device, ip, location, lastLogin)
- **Real-Time Data**: Admin panel displays live online status, device info, and location from database
- **Error Resolution**: Fixed "Failed to load Credit history" error in AdminScreen with proper endpoint implementation

## Real-Time Notification System (September 2025)

### Architecture Overview
- **Gateway Integration**: Socket gateway automatically joins users to personal notification rooms (`user_${userId}`) on connection
- **Notification Delivery**: HTTP endpoint `/emit-notification` on gateway (port 8000) for broadcasting notifications via WebSocket
- **Database**: user_notifications and user_notification_settings tables for persistent notification storage
- **Frontend**: HomeScreen listens to 'new_notification' socket events and updates badge count in real-time

### Implementation Details
- **Gateway Setup**: Users joined to personal rooms on socket authentication for targeted notification delivery
- **Backend Routes**: Follow and credit transfer endpoints create notifications and emit via gateway HTTP endpoint
- **Notification Types**: Support for follow notifications, credit_received notifications, and extensible for future types
- **Real-Time Updates**: Notifications appear instantly with alert dialogs and badge count updates
- **Data Flow**: API Server → Gateway HTTP endpoint → Socket.IO broadcast to user room → Client receives notification

### User Experience
- **Instant Alerts**: Pop-up alerts with emoji icons (🪙 for credits, 👤 for follows)
- **Badge Counter**: Real-time unread notification count on HomeScreen bell icon
- **Alert Actions**: Credit notifications include balance refresh, follow notifications show acknowledgment
- **Persistent Storage**: All notifications saved to database and retrievable via /notifications endpoint

## Avatar Frames Rental System (September 2025)

### Architecture Overview
- **Database Tables**: frame_items (catalog) and user_frames (ownership) with 14-day rental mechanics
- **API Endpoints**: GET /api/store/frames, GET /api/store/user-frames, POST /api/frames/purchase, POST /api/frames/equip
- **Auto-Expiry Job**: Hourly scheduled job removes expired frames and clears avatar_frame from user profiles
- **Frontend Integration**: StoreScreen displays frames in dedicated tab with purchase flow and expiry tracking

### Implementation Details
- **Frame Items Table**: Stores frame catalog with id, name, description, image path, price, duration_days (default 14), is_active status
- **User Frames Table**: Tracks ownership with user_id (FK to users), frame_id (FK to frame_items), purchased_at, expires_at, is_active
- **Database Integrity**: Foreign key constraints with ON DELETE CASCADE, unique constraint on (user_id, frame_id) to prevent duplicates
- **Seeded Items**: 4 default frames from assets/frame_ava (frame_av.jpeg, frame_av1.jpeg, frame_av3.png, frame_av4.png) with prices 50k-100k credits
- **Auto-Equip**: Purchase endpoint automatically sets user.avatar_frame to frame image path upon successful purchase
- **Cleanup Job**: Runs hourly to deactivate expired rentals and clear avatar_frame from user profiles, scheduled after table initialization

### User Experience
- **Store Interface**: Tabbed layout with separate Frames and Headwear sections in StoreScreen
- **Purchase Flow**: Users pay credits, frame auto-equips, and appears on profile immediately
- **Expiry Display**: Shows remaining days on owned frames, auto-removes after 14 days
- **Renewal**: Users can repurchase expired frames to extend rental period

## Room Connection Persistence System (September 2025)

### Architecture Overview
- **Socket Persistence**: Users remain connected to rooms when switching to other apps or minimizing the app
- **Activity Tracking**: lastActivityTime tracked for all room participants to monitor engagement
- **Auto-Cleanup**: Hourly job removes users inactive for 8+ hours from rooms
- **Auto-Rejoin Logic**: Server automatically rejoins users if socket connection exists but room membership is lost

### Implementation Details
- **Frontend (ChatScreen.tsx)**: Socket connection persists during component unmount - no disconnect unless user logs out or clicks Leave
- **Backend (socket-gateway.js)**: 
  - lastActivityTime field added to roomParticipants tracking (updated on join and message send)
  - Hourly cleanup job scans all rooms and removes participants inactive for 8+ hours
  - Auto-rejoin logic in sendMessage handler checks room membership and rejoins if needed
  - Cleanup broadcasts leave messages and force-disconnects inactive sockets
- **Disconnect Conditions**: Users only disconnect from rooms when:
  1. Manual leave via Leave button
  2. After 8 hours of inactivity (automatic cleanup)
  3. Logout action

### User Experience
- **Seamless Multitasking**: Users can switch to other apps and return without losing room connection
- **Background Persistence**: Room membership maintained while app is backgrounded or minimized
- **Automatic Cleanup**: Inactive users automatically removed after 8 hours to prevent ghost participants
- **Transparent Rejoin**: If connection is lost, server automatically rejoins user without manual intervention
- **Manual Control**: Users have explicit Leave button for intentional disconnection