import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Image,
  Alert,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { useTheme } from '../contexts/ThemeContext';
import { API_BASE_URL, BASE_URL } from '../utils/apiConfig';


export default function SettingsScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleDarkMode, colors } = useTheme();
  const [notifications, setNotifications] = useState(true);

  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };

  const handleLogout = () => {
    Alert.alert(
      'Konfirmasi Logout',
      'Apakah Anda yakin ingin keluar?',
      [
        {
          text: 'Batal',
          style: 'cancel',
        },
        {
          text: 'Keluar',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              // The AuthContext will automatically handle navigation to auth screen
              // No need to manually navigate
            } catch (error) {
              console.error('Logout error:', error);
              // Even if logout fails, the auth context should handle it
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const themedStyles = useMemo(() => ({
    container: {
      ...styles.container,
      backgroundColor: colors.background,
    },
    profileSection: {
      ...styles.profileSection,
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
    },
    settingsSection: {
      ...styles.settingsSection,
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
    },
    settingsItem: {
      ...styles.settingsItem,
      borderBottomColor: colors.border,
    },
    settingsItemText: {
      ...styles.settingsItemText,
      color: colors.text,
    },
    username: {
      ...styles.username,
      color: colors.text,
    },
    email: {
      ...styles.email,
      color: colors.textSecondary,
    },
    editProfileText: {
      ...styles.editProfileText,
      color: colors.text,
    },
    editProfileButton: {
      ...styles.editProfileButton,
      backgroundColor: colors.card,
    },
    statusBadge: {
      ...styles.statusBadge,
      backgroundColor: colors.successBadgeBg,
    },
    statusText: {
      ...styles.statusText,
      color: colors.successBadgeText,
    },
    notificationBadge: {
      ...styles.notificationBadge,
      backgroundColor: colors.error,
    },
    statusIndicator: {
      backgroundColor: colors.statusOnline,
    },
    adminBadge: {
      ...styles.adminBadge,
      backgroundColor: colors.infoBadgeBg,
    },
    adminBadgeText: {
      ...styles.adminBadgeText,
      color: colors.infoBadgeText,
    },
    levelBadge: {
      ...styles.levelBadge,
      backgroundColor: colors.info,
    },
    statusIndicatorBorder: {
      borderColor: colors.surface,
    },
    avatar: {
      ...styles.avatar,
      backgroundColor: colors.avatarBg,
    },
    levelText: {
      ...styles.levelText,
      color: colors.badgeTextLight,
    },
    notificationText: {
      ...styles.notificationText,
      color: colors.badgeTextLight,
    },
    avatarText: {
      ...styles.avatarText,
      color: colors.badgeTextLight,
    },
  }), [colors, isDarkMode]);

  const ProfileSection = () => (
    <View style={themedStyles.profileSection}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <View style={themedStyles.avatar}>
            {user?.avatar ? (
              <Image 
                source={{ 
                  uri: user.avatar.startsWith('http') ? user.avatar : `${BASE_URL}${user.avatar}` 
                }} 
                style={styles.avatarImage} 
              />
            ) : (
              <Text style={themedStyles.avatarText}>
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            )}
          </View>
          <View style={[themedStyles.statusIndicator, styles.statusIndicator, themedStyles.statusIndicatorBorder]} />
          <View style={themedStyles.notificationBadge}>
            <Text style={themedStyles.notificationText}>A</Text>
          </View>
        </View>
        <View style={styles.profileInfo}>
          <Text style={themedStyles.username}>{user?.username || 'pengembang'}</Text>
          <Text style={themedStyles.email}>{user?.email || 'meongkwl@gmail.com'}</Text>
          <View style={styles.badgeContainer}>
            <View style={themedStyles.levelBadge}>
              <Ionicons name="trophy" size={12} color={colors.badgeTextLight} />
              <Text style={themedStyles.levelText}>Tingkat 1</Text>
            </View>
            <View style={themedStyles.statusBadge}>
              <Text style={themedStyles.statusText}>Online</Text>
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity style={themedStyles.editProfileButton} onPress={handleEditProfile}>
        <Text style={themedStyles.editProfileText}>Edit Profil</Text>
      </TouchableOpacity>
    </View>
  );

  const SettingsItem = ({
    icon,
    title,
    hasSwitch,
    switchValue,
    onSwitchChange,
    hasArrow = true,
    onPress,
    iconColor,
    titleColor,
    badgeText
  }: {
    icon: string;
    title: string;
    hasSwitch?: boolean;
    switchValue?: boolean;
    onSwitchChange?: (value: boolean) => void;
    hasArrow?: boolean;
    onPress?: () => void;
    iconColor?: string;
    titleColor?: string;
    badgeText?: string;
  }) => (
    <TouchableOpacity
      style={themedStyles.settingsItem}
      onPress={onPress}
      disabled={hasSwitch}
    >
      <View style={styles.settingsItemLeft}>
        <Ionicons name={icon as any} size={20} color={iconColor || colors.iconDefault} />
        <Text style={[themedStyles.settingsItemText, titleColor && { color: titleColor }]}>{title}</Text>
      </View>
      <View style={styles.settingsItemRight}>
        {badgeText && (
          <View style={themedStyles.adminBadge}>
            <Text style={themedStyles.adminBadgeText}>{badgeText}</Text>
          </View>
        )}
        {hasSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.switchThumb}
          />
        ) : hasArrow ? (
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={themedStyles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <ProfileSection />

        <View style={themedStyles.settingsSection}>
          <SettingsItem
            icon="notifications"
            title="Pemberitahuan"
            hasSwitch
            switchValue={notifications}
            onSwitchChange={setNotifications}
            iconColor={colors.primary}
          />

          <SettingsItem
            icon="moon"
            title="Mode Gelap"
            hasSwitch
            switchValue={isDarkMode}
            onSwitchChange={toggleDarkMode}
            iconColor={colors.primary}
          />

          <SettingsItem
            icon="shield-checkmark"
            title="Privasi & Keamanan"
            iconColor={colors.primary}
            onPress={() => navigation.navigate('PrivacySecurity')}
          />

          <SettingsItem
            icon="information-circle"
            title="Info"
            iconColor={colors.info}
            onPress={() => navigation.navigate('InfoScreen')}
          />

          <SettingsItem
            icon="help-circle"
            title="Bantuan & Dukungan"
            iconColor={colors.primary}
            onPress={() => navigation.navigate('HelpSupport')}
          />

          <SettingsItem
            icon="card"
            title="Kredit"
            iconColor={colors.primary}
            onPress={() => navigation.navigate('Credit')}
          />

          <SettingsItem
            icon="wallet"
            title="Withdraw"
            iconColor={colors.success}
            onPress={() => navigation.navigate('Withdraw')}
          />

          {/* Mentor Menu Item - Only visible for mentor users */}
          {user?.role === 'mentor' && (
            <SettingsItem
              icon="school"
              title="Mentor"
              iconColor={colors.error}
              onPress={() => navigation.navigate('Mentor')}
            />
          )}

          {/* Toko Menu Item */}
          <SettingsItem
            icon="storefront"
            title="Toko"
            iconColor={colors.success}
            onPress={() => navigation.navigate('StoreScreen')}
          />

          {/* Family Menu Item */}
          <SettingsItem
            icon="people"
            title="Family"
            iconColor={colors.info}
            onPress={() => navigation.navigate('FamilyScreen')}
          />

          {/* Admin Panel Menu Item - Only visible for admin users */}
          {user?.role === 'admin' && (
            <SettingsItem
              icon="shield-checkmark"
              title="Admin Panel"
              iconColor={colors.warning}
              badgeText="ADMIN"
              onPress={() => navigation.navigate('AdminScreen')}
            />
          )}

          <SettingsItem
            icon="log-out"
            title="Keluar"
            iconColor={colors.error}
            titleColor={colors.error}
            hasArrow={false}
            onPress={handleLogout}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  profileSection: {
    padding: 20,
    marginTop: 20,
    marginHorizontal: 20,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  profileInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  levelText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
  },
  editProfileButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editProfileText: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingsSection: {
    margin: 20,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  settingsItemText: {
    fontSize: 16,
    marginLeft: 12,
    flex: 1,
    flexShrink: 1,
  },
  settingsItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Styles for Admin Panel menu item (if it were to be modified, not used in the final output based on the above)
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
});