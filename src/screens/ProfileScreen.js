import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  Platform,
  Linking 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getSavedEvents, getSwipedEventIds } from '../services/eventService';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { deleteUser } from 'firebase/auth';
import { auth } from '../config/firebase';
import i18n from '../i18n';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState({ saved: 0, swiped: 0 });
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    if (!user?.uid) return;
    
    const saved = await getSavedEvents(user.uid);
    const swiped = await getSwipedEventIds(user.uid);
    
    setStats({
      saved: saved.length,
      swiped: swiped.length,
    });
  };

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [user])
  );

  const handleResetSwiped = async () => {
    const doReset = async () => {
      setLoading(true);
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          swipedEvents: []
        });
        setStats(prev => ({ ...prev, swiped: 0 }));
        
        if (Platform.OS === 'web') {
          window.alert(i18n.t('profile.resetSuccess'));
        } else {
          Alert.alert(i18n.t('common.success'), i18n.t('profile.resetSuccess'));
        }
      } catch (error) {
        console.error('Error resetting swiped events:', error);
        if (Platform.OS === 'web') {
          window.alert(i18n.t('profile.resetFailed'));
        } else {
          Alert.alert(i18n.t('common.error'), i18n.t('profile.resetFailed'));
        }
      }
      setLoading(false);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(i18n.t('profile.resetConfirm'))) {
        await doReset();
      }
    } else {
      Alert.alert(
        i18n.t('profile.resetSwiped'),
        i18n.t('profile.resetConfirm'),
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          { text: i18n.t('common.reset'), onPress: doReset },
        ]
      );
    }
  };

  const handleDeleteAccount = async () => {
    const doDelete = async () => {
      setLoading(true);
      try {
        // Delete user data from Firestore
        const userRef = doc(db, 'users', user.uid);
        await deleteDoc(userRef);
        
        // Delete Firebase auth account
        await deleteUser(auth.currentUser);
        
      } catch (error) {
        console.error('Error deleting account:', error);
        
        // If error is due to requiring recent login
        if (error.code === 'auth/requires-recent-login') {
          if (Platform.OS === 'web') {
            window.alert(i18n.t('profile.reAuthRequired'));
          } else {
            Alert.alert(
              i18n.t('profile.reAuthRequiredTitle'), 
              i18n.t('profile.reAuthRequired')
            );
          }
        } else {
          if (Platform.OS === 'web') {
            window.alert(i18n.t('profile.deleteAccountFailed'));
          } else {
            Alert.alert(i18n.t('common.error'), i18n.t('profile.deleteAccountFailed'));
          }
        }
      }
      setLoading(false);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(i18n.t('profile.deleteConfirm'))) {
        await doDelete();
      }
    } else {
      Alert.alert(
        i18n.t('profile.deleteAccount'),
        i18n.t('profile.deleteConfirm'),
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          { text: i18n.t('common.delete'), style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleSupport = () => {
    Linking.openURL('mailto:support@eventswipeapp.com?subject=EventSwipe Support Request');
  };

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm(i18n.t('profile.signOutConfirm'))) {
        await signOut();
      }
    } else {
      Alert.alert(
        i18n.t('common.signOut'),
        i18n.t('profile.signOutConfirm'),
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          { text: i18n.t('common.signOut'), onPress: signOut },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{i18n.t('profile.title')}</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* User Info */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.email}>{user?.email}</Text>
          
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.saved}</Text>
              <Text style={styles.statLabel}>{i18n.t('profile.saved')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.swiped}</Text>
              <Text style={styles.statLabel}>{i18n.t('profile.swiped')}</Text>
            </View>
          </View>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t('profile.preferences')}</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleResetSwiped} disabled={loading}>
            <View style={[styles.menuIcon, { backgroundColor: '#E8FAF8' }]}>
              <Ionicons name="refresh-outline" size={20} color="#4ECDC4" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuText}>{i18n.t('profile.resetSwiped')}</Text>
              <Text style={styles.menuSubtext}>{i18n.t('profile.resetSwipedText')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t('profile.account')}</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleSupport}>
            <View style={[styles.menuIcon, { backgroundColor: '#FFF3E8' }]}>
              <Ionicons name="help-circle-outline" size={20} color="#FF9F43" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuText}>{i18n.t('profile.helpSupport')}</Text>
              <Text style={styles.menuSubtext}>{i18n.t('profile.helpSupportText')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleDeleteAccount} disabled={loading}>
            <View style={[styles.menuIcon, { backgroundColor: '#FFE8E8' }]}>
              <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuText, { color: '#FF6B6B' }]}>{i18n.t('profile.deleteAccount')}</Text>
              <Text style={styles.menuSubtext}>{i18n.t('profile.deleteAccountText')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} disabled={loading}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.signOutText}>{i18n.t('common.signOut')}</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.version}>{i18n.t('profile.version')}</Text>
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
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#eee',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  menuSubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginTop: 24,
  },
});