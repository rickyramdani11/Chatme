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