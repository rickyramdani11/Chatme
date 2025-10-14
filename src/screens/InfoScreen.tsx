import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';
import { useFocusEffect } from '@react-navigation/native';

interface Person {
  id: number;
  username: string;
  role: string;
  level: number;
  avatar?: string;
  status?: string;
}

export default function InfoScreen({ navigation }: any) {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'commands' | 'people'>('commands');
  const [merchants, setMerchants] = useState<Person[]>([]);
  const [mentors, setMentors] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const gameCommands = [
    {
      game: 'LowCard Bot',
      icon: 'game-controller',
      color: '#9C27B0',
      commands: [
        { cmd: '!start [bet]', desc: 'Mulai permainan dengan taruhan' },
        { cmd: '!j', desc: 'Join game (bergabung dengan permainan)' },
        { cmd: '!d', desc: 'Tembak kartu (draw card)' },
      ],
    },
    {
      game: 'Bacarat',
      icon: 'diamond',
      color: '#E91E63',
      commands: [
        { cmd: '!start', desc: 'Start game (mulai permainan)' },
        { cmd: '!b p [bet]', desc: 'Bet Player - Taruhan pada Player' },
        { cmd: '!b b [bet]', desc: 'Bet Banker - Taruhan pada Banker' },
        { cmd: '!b t [bet]', desc: 'Bet Tie - Taruhan pada Draw (coin kembali jika menang)' },
      ],
    },
    {
      game: 'Sicbo',
      icon: 'cube',
      color: '#FF5722',
      commands: [
        { cmd: '!s [bet] big', desc: 'Contoh: !s 500 big - Taruhan 500 pada BIG' },
        { cmd: '!s [bet] small', desc: 'Contoh: !s 1000 small - Taruhan 1000 pada SMALL' },
        { cmd: '!s [bet] odd', desc: 'Contoh: !s 2000 odd - Taruhan 2000 pada ODD' },
        { cmd: '!s [bet] total:[n]', desc: 'Contoh: !s 500 total:15 - Taruhan 500 pada total 15' },
        { cmd: '!s [bet] single:[n]', desc: 'Contoh: !s 1000 single:5 - Taruhan 1000 pada dadu angka 5' },
      ],
    },
  ];

  const otherCommands = [
    { cmd: '@username', desc: 'Tag user dalam chat' },
    { cmd: '/gift @username [giftname]', desc: 'Kirim gift ke user' },
    { cmd: '/transfer @username [amount]', desc: 'Transfer kredit ke user' },
  ];

  const fetchMerchantsAndMentors = useCallback(async () => {
    if (!token) {
      console.log('❌ No token available for fetching merchants/mentors');
      return;
    }

    try {
      console.log('📋 Fetching merchants and mentors from API...');
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/users/merchants-mentors`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response content-type:', response.headers.get('content-type'));
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('❌ Non-JSON response received:', text.substring(0, 200));
        throw new Error('Server returned non-JSON response');
      }
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Data received:', data);
        setMerchants(data.merchants || []);
        setMentors(data.mentors || []);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ API error:', errorData);
        throw new Error(errorData.error || 'Failed to fetch merchants and mentors');
      }
    } catch (error) {
      console.error('❌ Error fetching merchants and mentors:', error);
      setMerchants([]);
      setMentors([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'people') {
        fetchMerchantsAndMentors();
      }
    }, [activeTab, fetchMerchantsAndMentors])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMerchantsAndMentors();
  }, [fetchMerchantsAndMentors]);

  const handlePersonPress = async (person: Person) => {
    try {
      const participants = [user?.username, person.username].sort();
      const response = await fetch(`${API_BASE_URL}/api/chat/private`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ participants }),
      });

      if (response.ok) {
        const privateChat = await response.json();
        const currentUserId = user?.id ? String(user.id) : '';
        const personId = String(person.id);
        const userIds = [currentUserId, personId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatId = `private_${userIds[0]}_${userIds[1]}`;

        navigation.navigate('PrivateChat', {
          roomId: chatId,
          roomName: `Chat with ${person.username}`,
          roomDescription: `Private chat with ${person.username}`,
          type: 'private',
          targetUser: {
            id: personId,
            username: person.username,
            role: person.role,
            level: person.level,
            avatar: person.avatar,
          },
          targetStatus: person.status || 'online',
          autoFocusTab: true,
        });
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Tidak dapat membuka chat');
      }
    } catch (error) {
      console.error('Error opening chat:', error);
      Alert.alert('Error', 'Terjadi kesalahan saat membuka chat');
    }
  };

  const renderCommands = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Game Commands</Text>
        {gameCommands.map((game, index) => (
          <View key={index} style={styles.gameCard}>
            <View style={styles.gameHeader}>
              <Ionicons name={game.icon as any} size={24} color={game.color} />
              <Text style={[styles.gameName, { color: game.color }]}>{game.game}</Text>
            </View>
            {game.commands.map((command, cmdIndex) => (
              <View key={cmdIndex} style={styles.commandItem}>
                <Text style={styles.commandText}>{command.cmd}</Text>
                <Text style={styles.commandDesc}>{command.desc}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Other Commands</Text>
        <View style={styles.gameCard}>
          {otherCommands.map((command, index) => (
            <View key={index} style={styles.commandItem}>
              <Text style={styles.commandText}>{command.cmd}</Text>
              <Text style={styles.commandDesc}>{command.desc}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  const renderPeople = () => (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9C27B0']} />
      }
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9C27B0" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Merchants</Text>
            {merchants.length > 0 ? (
              merchants.map((merchant) => (
                <TouchableOpacity
                  key={merchant.id}
                  style={styles.personCard}
                  onPress={() => handlePersonPress(merchant)}
                >
                  <View style={styles.personInfo}>
                    <View style={styles.personAvatar}>
                      <Text style={styles.personAvatarText}>
                        {merchant.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.personDetails}>
                      <Text style={styles.personName}>{merchant.username}</Text>
                      <View style={styles.personBadges}>
                        <View style={[styles.roleBadge, { backgroundColor: '#F3E5F5' }]}>
                          <Text style={[styles.roleText, { color: '#9C27B0' }]}>Merchant</Text>
                        </View>
                        <Text style={styles.levelText}>Lv. {merchant.level || 1}</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chatbubble-ellipses" size={24} color="#9C27B0" />
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyText}>Tidak ada merchant saat ini</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mentors</Text>
            {mentors.length > 0 ? (
              mentors.map((mentor) => (
                <TouchableOpacity
                  key={mentor.id}
                  style={styles.personCard}
                  onPress={() => handlePersonPress(mentor)}
                >
                  <View style={styles.personInfo}>
                    <View style={styles.personAvatar}>
                      <Text style={styles.personAvatarText}>
                        {mentor.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.personDetails}>
                      <Text style={styles.personName}>{mentor.username}</Text>
                      <View style={styles.personBadges}>
                        <View style={[styles.roleBadge, { backgroundColor: '#FBE9E7' }]}>
                          <Text style={[styles.roleText, { color: '#FF6B35' }]}>Mentor</Text>
                        </View>
                        <Text style={styles.levelText}>Lv. {mentor.level || 1}</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chatbubble-ellipses" size={24} color="#FF6B35" />
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyText}>Tidak ada mentor saat ini</Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Info</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'commands' && styles.activeTab]}
          onPress={() => setActiveTab('commands')}
        >
          <Ionicons
            name="terminal"
            size={20}
            color={activeTab === 'commands' ? '#9C27B0' : '#999'}
          />
          <Text style={[styles.tabText, activeTab === 'commands' && styles.activeTabText]}>
            Commands
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'people' && styles.activeTab]}
          onPress={() => setActiveTab('people')}
        >
          <Ionicons name="people" size={20} color={activeTab === 'people' ? '#9C27B0' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'people' && styles.activeTabText]}>
            People
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'commands' ? renderCommands() : renderPeople()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#9C27B0',
  },
  tabText: {
    fontSize: 16,
    color: '#999',
    marginLeft: 8,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#9C27B0',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  gameCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  gameName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  commandItem: {
    marginBottom: 12,
  },
  commandText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  commandDesc: {
    fontSize: 13,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#999',
  },
  personCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  personInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  personAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#9C27B0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  personAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  personDetails: {
    flex: 1,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  personBadges: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  levelText: {
    fontSize: 12,
    color: '#666',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
