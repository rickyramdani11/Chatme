import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

interface ReferralStats {
  totalInvited: number;
  totalBonusEarned: number;
  pendingBonus: number;
}

interface ReferralHistoryItem {
  id: number;
  invitedUsername: string;
  invitedAt: string;
  firstWithdrawalCompleted: boolean;
  bonusClaimed: boolean;
  bonusClaimedAt?: string;
  bonusAmount: number;
}

export default function InviteFriendsScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [stats, setStats] = useState<ReferralStats>({
    totalInvited: 0,
    totalBonusEarned: 0,
    pendingBonus: 0
  });
  const [history, setHistory] = useState<ReferralHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReferralData = async () => {
    try {
      setLoading(true);

      // Fetch invite code
      const codeResponse = await fetch(`${API_BASE_URL}/referral/my-code`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (codeResponse.ok) {
        const codeData = await codeResponse.json();
        setInviteCode(codeData.inviteCode);
      }

      // Fetch stats
      const statsResponse = await fetch(`${API_BASE_URL}/referral/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.stats);
      }

      // Fetch history
      const historyResponse = await fetch(`${API_BASE_URL}/referral/history`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        setHistory(historyData.referrals || []);
      }
    } catch (error) {
      console.error('Error fetching referral data:', error);
      Alert.alert('Error', 'Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReferralData();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchReferralData();
  }, []);

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert('Copied!', 'Invite code copied to clipboard');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join ChatMe with my invite code: ${inviteCode}\n\nDownload now and start chatting!`,
        title: 'Join ChatMe'
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Invite Friends</Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Loading referral info...</Text>
          </View>
        ) : (
          <>
            {/* Invite Code Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your Invite Code</Text>
              <View style={styles.codeContainer}>
                <Text style={styles.codeText}>{inviteCode}</Text>
              </View>
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.copyButton]}
                  onPress={handleCopyCode}
                >
                  <Ionicons name="copy-outline" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Copy Code</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.shareButton]}
                  onPress={handleShare}
                >
                  <Ionicons name="share-social-outline" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Bonus Info */}
            <View style={styles.infoCard}>
              <Ionicons name="gift" size={24} color="#667eea" />
              <Text style={styles.infoText}>
                Earn 10,000 credits when your friend completes their first withdrawal!
              </Text>
            </View>

            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.totalInvited}</Text>
                <Text style={styles.statLabel}>Friends Invited</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {stats.totalBonusEarned.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Credits Earned</Text>
              </View>
            </View>

            {/* Referral History */}
            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>Referral History</Text>
              {history.length > 0 ? (
                history.map((item) => (
                  <View key={item.id} style={styles.historyItem}>
                    <View style={styles.historyLeft}>
                      <View style={styles.userIcon}>
                        <Ionicons name="person" size={20} color="#667eea" />
                      </View>
                      <View>
                        <Text style={styles.historyUsername}>
                          {item.invitedUsername}
                        </Text>
                        <Text style={styles.historyDate}>
                          Joined {formatDate(item.invitedAt)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.historyRight}>
                      {item.bonusClaimed ? (
                        <View style={styles.bonusClaimedBadge}>
                          <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                          <Text style={styles.bonusClaimedText}>
                            +{item.bonusAmount.toLocaleString()}
                          </Text>
                        </View>
                      ) : item.firstWithdrawalCompleted ? (
                        <View style={styles.bonusPendingBadge}>
                          <Ionicons name="hourglass-outline" size={16} color="#FF9800" />
                          <Text style={styles.bonusPendingText}>Processing</Text>
                        </View>
                      ) : (
                        <View style={styles.bonusPendingBadge}>
                          <Ionicons name="time-outline" size={16} color="#9E9E9E" />
                          <Text style={styles.bonusPendingText}>Pending</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>No referrals yet</Text>
                  <Text style={styles.emptySubtext}>
                    Share your invite code to get started!
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

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
  },
  backButton: {
    marginRight: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 20,
    borderRadius: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  codeContainer: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#667eea',
    borderStyle: 'dashed',
  },
  codeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#667eea',
    textAlign: 'center',
    letterSpacing: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  copyButton: {
    backgroundColor: '#667eea',
  },
  shareButton: {
    backgroundColor: '#764ba2',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 15,
    borderRadius: 10,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1976d2',
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  historySection: {
    marginHorizontal: 15,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  historyItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  historyDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  bonusClaimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#e8f5e9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  bonusClaimedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  bonusPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f5f5f5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  bonusPendingText: {
    fontSize: 12,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 15,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 5,
  },
});
