import React, { useEffect, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkForAppUpdate, storeUrl } from '../services/appUpdateService';
import i18n from '../i18n';

const TAB_BAR_HEIGHT = 60; // matches TabNavigator

const openStore = () => Linking.openURL(storeUrl).catch(() => {});

/**
 * "A new version is available" prompt, controlled remotely (see
 * appUpdateService). A floating banner above the tab bar that can be
 * dismissed for the session, or a blocking screen when the update is required.
 */
export default function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const [update, setUpdate] = useState({ status: 'none' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkForAppUpdate().then(setUpdate);
  }, []);

  if (update.status === 'required') {
    return (
      <Modal visible animationType="fade" onRequestClose={() => {}}>
        <View style={styles.requiredScreen}>
          <Text style={styles.logo}>EventSwipe</Text>
          <Text style={styles.requiredTitle}>{i18n.t('update.requiredTitle')}</Text>
          <Text style={styles.requiredBody}>{update.message || i18n.t('update.requiredBody')}</Text>
          <TouchableOpacity style={styles.requiredButton} onPress={openStore} accessibilityRole="button">
            <Text style={styles.requiredButtonText}>{i18n.t('update.button')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  if (update.status !== 'available' || dismissed) return null;

  return (
    <View style={[styles.banner, { bottom: TAB_BAR_HEIGHT + insets.bottom + 12 }]}>
      <Ionicons name="arrow-up-circle" size={26} color="#fff" />
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{i18n.t('update.availableTitle')}</Text>
        <Text style={styles.bannerBody} numberOfLines={2}>{update.message || i18n.t('update.availableBody')}</Text>
      </View>
      <TouchableOpacity style={styles.bannerButton} onPress={openStore} accessibilityRole="button">
        <Text style={styles.bannerButtonText}>{i18n.t('update.button')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={i18n.t('common.close')}
      >
        <Ionicons name="close" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#333',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    // Above the cards and the save fireworks
    zIndex: 200,
    elevation: 200,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  bannerBody: {
    color: '#ddd',
    fontSize: 13,
    marginTop: 1,
  },
  bannerButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  bannerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  requiredScreen: {
    flex: 1,
    backgroundColor: '#4ECDC4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logo: {
    fontSize: 40,
    fontFamily: 'Shrikhand_400Regular',
    color: '#fff',
    marginBottom: 32,
  },
  requiredTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  requiredBody: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  requiredButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  requiredButtonText: {
    color: '#3BA99F',
    fontSize: 17,
    fontWeight: '700',
  },
});
