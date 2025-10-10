import React from 'react';
import { BackHandler } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, TabParamList } from './types';

import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import FriendsScreen from '../screens/FriendsScreen';
import FeedScreen from '../screens/FeedScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import RoomScreen from '../screens/RoomScreen';
import ChatScreen from '../screens/Chatscreen1';
import PrivateChatScreen from '../screens/PrivateChatScreen';
import ProfileScreen from '../screens/ProfileScreen'; // Assuming ProfileScreen is in ../screens/ProfileScreen
import PrivacySecurityScreen from '../screens/PrivacySecurityScreen'; // Import the new screen
import ChangePasswordScreen from '../screens/ChangePasswordScreen'; // Import ChangePasswordScreen
import ChangePinScreen from '../screens/ChangePinScreen'; // Import ChangePinScreen
import HelpSupportScreen from '../screens/HelpSupportScreen';
import LiveChatScreen from '../screens/LiveChatScreen';

// Import the new CreditScreen
import CreditScreen from '../screens/CreditScreen';
// Import the new TransactionHistoryScreen
import TransactionHistoryScreen from '../screens/TransactionHistoryScreen';
// Import MentorScreen
import MentorScreen from '../screens/MentorScreen';
// Import NotificationsScreen
import NotificationsScreen from '../screens/NotificationsScreen';

// Import AdminScreen
import AdminScreen from '../screens/AdminScreen';
// Import TopRankScreen
import TopRankScreen from '../screens/TopRankScreen';
// Import WithdrawScreen
import WithdrawScreen from '../screens/WithdrawScreen';
// Import WithdrawHistoryScreen
import WithdrawHistoryScreen from '../screens/WithdrawHistoryScreen';
// Import StoreScreen
import StoreScreen from '../screens/StoreScreen';
// Import FamilyScreen
import FamilyScreen from '../screens/FamilyScreen';
// Import CreateFamilyScreen
import CreateFamilyScreen from '../screens/CreateFamilyScreen';
// Import FamilyDetailScreen
import FamilyDetailScreen from '../screens/FamilyDetailScreen';
// Import ChatHistoryScreen
import ChatHistoryScreen from '../screens/ChatHistoryScreen';
// Import InfoScreen
import InfoScreen from '../screens/InfoScreen';
// Import GlobalIncomingCallManager
import { GlobalIncomingCallManager } from '../components/GlobalIncomingCallManager';

import { useAuth } from '../hooks';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createMaterialTopTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Feed') {
            iconName = focused ? 'newspaper' : 'newspaper-outline';
          } else if (route.name === 'Room') {
            iconName = focused ? 'chatbubble' : 'chatbubble-outline';
          } else if (route.name === 'Chat') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          } else {
            iconName = 'ellipse-outline';
          }

          return <Ionicons name={iconName} size={20} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: '#fff',
          elevation: 5,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        tabBarIndicatorStyle: {
          backgroundColor: '#007AFF',
          height: 3,
        },
        tabBarShowIcon: true,
        swipeEnabled: true,
        animationEnabled: true,
      })}
      tabBarPosition="bottom"
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Room" component={RoomScreen} />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarStyle: { display: 'none' }
        }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user } = useAuth();

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PrivacySecurity"
            component={PrivacySecurityScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ChangePassword"
            component={ChangePasswordScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ChangePin"
            component={ChangePinScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="HelpSupport"
            component={HelpSupportScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="InfoScreen"
            component={InfoScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="LiveChat"
            component={LiveChatScreen}
            options={{ headerShown: false }}
          />
          {/* Add Credit screen to Stack Navigator */}
          <Stack.Screen
            name="Credit"
            component={CreditScreen}
            options={{ headerShown: false }}
          />
          {/* Add TransactionHistory screen to Stack Navigator */}
          <Stack.Screen
            name="TransactionHistory"
            component={TransactionHistoryScreen}
            options={{ headerShown: false }}
          />
          {/* Add TopRank screen to Stack Navigator */}
          <Stack.Screen
            name="TopRank"
            component={TopRankScreen}
            options={{ headerShown: false }}
          />
          {/* Add Notifications screen to Stack Navigator */}
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ headerShown: false }}
          />
          {/* Add Mentor screen to Stack Navigator */}
          <Stack.Screen
            name="Mentor"
            component={MentorScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminScreen"
            component={AdminScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{
              headerShown: false
            }}
          />
          <Stack.Screen name="PrivateChat" component={PrivateChatScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="Room"
            component={RoomScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Withdraw"
            component={WithdrawScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="WithdrawHistory"
            component={WithdrawHistoryScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="StoreScreen"
            component={StoreScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="FamilyScreen"
            component={FamilyScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CreateFamilyScreen"
            component={CreateFamilyScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="FamilyDetailScreen"
            component={FamilyDetailScreen}
            options={{ headerShown: false }}
          />
          {/* Add ChatHistory screen to Stack Navigator */}
          <Stack.Screen
            name="ChatHistory"
            component={ChatHistoryScreen}
            options={{ headerShown: false }}
          />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
      </Stack.Navigator>
      
      {/* Global Incoming Call Manager - Always active when user is logged in */}
      {user && <GlobalIncomingCallManager />}
    </>
  );
}