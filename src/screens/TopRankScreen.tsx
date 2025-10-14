
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
  FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { API_BASE_URL, BASE_URL } from '../utils/apiConfig';
import AnimatedFrameOverlay from '../components/AnimatedFrameOverlay';


interface RankingUser {
  rank: number;
  id: string;
  username: string;
  avatar?: string;
  avatarFrame?: string | null;
  level: number;
  verified: boolean;
  score?: number;
  credits?: number;
  wealthScore?: number;
  totalGifts?: number;
  personaScore?: number;
}

type RankingType = 'games' | 'wealth' | 'gifts';

const TopRankScreen = ({ navigation }: any) => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<RankingType>('games');
  const [rankings, setRankings] = useState<RankingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRankings = async (type: RankingType) => {
    try {
      setLoading(true);
      console.log(`Fetching ${type} rankings...`);

      const response = await fetch(`${API_BASE_URL}/rankings/${type}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      console.log(`${type} rankings response status:`, response.status);

      if (response.ok) {
        const data = await response.json();
        console.log(`${type} rankings data received:`, data.length, 'entries');
        setRankings(data);
      } else {
        const errorData = await response.json();
        console.error(`Failed to fetch ${type} rankings:`, errorData);
        Alert.alert('Error', `Failed to fetch ${type} rankings`);
        setRankings([]);
      }
    } catch (error) {
      console.error(`Error fetching ${type} rankings:`, error);
      Alert.alert('Error', `Failed to fetch ${type} rankings`);
      setRankings([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRankings(activeTab);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchRankings(activeTab);
  }, [activeTab]);

  const handleTabChange = (tab: RankingType) => {
    setActiveTab(tab);
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getTabIcon = (tab: RankingType) => {
    switch (tab) {
      case 'games': return 'game-controller';
      case 'wealth': return 'diamond';
      case 'gifts': return 'gift';
    }
  };

  const getScoreDisplay = (user: RankingUser) => {
    switch (activeTab) {
      case 'games':
        return `Total Played: ${user.score || 0} coins`;
      case 'wealth':
        return `${user.credits || 0} credits`;
      case 'gifts':
        return `${user.totalGifts || 0} gifts`;
    }
  };

  const renderRankingItem = ({ item, index }: { item: RankingUser; index: number }) => (
    <View style={[
      styles.rankingCard,
      index < 3 && styles.topThreeCard
    ]}>
      <View style={styles.rankInfo}>
        <Text style={[
          styles.rankNumber,
          index < 3 && styles.topThreeRank
        ]}>
          {getRankIcon(item.rank)}
        </Text>
      </View>

      <View style={styles.userInfo}>
        <View style={styles.avatarContainer}>
          {/* Avatar Frame Overlay */}
          {item.avatarFrame && (
            <AnimatedFrameOverlay
              frameImage={item.avatarFrame.startsWith('http') ? item.avatarFrame : `${BASE_URL}${item.avatarFrame}`}
              animationUrl={null}
              size={58}
              style={{ position: 'absolute', top: -4, left: -4, zIndex: 2 }}
            />
          )}
          
          {/* Avatar Image */}
          {item.avatar ? (
            <Image 
              source={{ uri: item.avatar }} 
              style={styles.avatar}
              onError={(error) => {
                console.log('Failed to load avatar:', item.avatar, error.nativeEvent.error);
              }}
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: index < 3 ? '#FFD700' : '#9E9E9E' }]}>
              <Text style={styles.avatarText}>
                {item.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          
          {/* Verified Badge */}
          {item.verified && (
            <Ionicons 
              name="checkmark-circle" 
              size={16} 
              color="#4CAF50" 
              style={styles.verifiedBadge} 
            />
          )}
        </View>

        <View style={styles.userDetails}>
          <View style={styles.nameContainer}>
            <Text style={styles.username}>{item.username}</Text>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>Lv.{item.level}</Text>
            </View>
          </View>
          <Text style={styles.scoreText}>{getScoreDisplay(item)}</Text>
        </View>
      </View>

      {index < 3 && (
        <View style={styles.crownContainer}>
          <Ionicons name="trophy" size={24} color="#FFD700" />
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#FF6B35', '#F7931E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>🏆 Top Rankings</Text>
        
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {(['games', 'wealth', 'gifts'] as RankingType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && styles.activeTab
            ]}
            onPress={() => handleTabChange(tab)}
          >
            <Ionicons 
              name={getTabIcon(tab) as any} 
              size={20} 
              color={activeTab === tab ? '#fff' : '#666'} 
            />
            <Text style={[
              styles.tabText,
              activeTab === tab && styles.activeTabText
            ]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Rankings List */}
      <FlatList
        data={rankings}
        renderItem={renderRankingItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="trophy-outline" size={60} color="#ccc" />
            <Text style={styles.emptyTitle}>No Rankings Available</Text>
            <Text style={styles.emptySubtitle}>
              {loading ? 'Loading rankings...' : 'Be the first to make it to the rankings!'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  refreshButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 15,
    padding: 5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#FF6B35',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  listContainer: {
    padding: 20,
  },
  rankingCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  topThreeCard: {
    borderWidth: 2,
    borderColor: '#FFD700',
    backgroundColor: '#FFFBF0',
  },
  rankInfo: {
    width: 50,
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  topThreeRank: {
    fontSize: 24,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 15,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  userDetails: {
    flex: 1,
    marginLeft: 12,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  levelBadge: {
    backgroundColor: '#9C27B0',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  levelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scoreText: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  crownContainer: {
    marginLeft: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default TopRankScreen;
