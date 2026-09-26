import React from 'react';
import { View, ActivityIndicator, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { EventCacheProvider } from './src/context/EventCacheContext';
import AuthModal from './src/components/AuthModal';
import TabNavigator from './src/navigation/TabNavigator';
import { useFonts, Shrikhand_400Regular } from '@expo-google-fonts/shrikhand';
import { perfMark } from './src/utils/perf';

function AppContent() {
  const { user, isLoading, guestUnavailable, authPrompt, closeAuthPrompt } = useAuth();

  if (!isLoading) {
    // Auth has settled: firebase restored (or failed to restore) the session AND
    // the Firestore user doc read finished. Nothing below this mounts before it.
    perfMark('auth:resolved', { signedIn: !!user });
  }

  // Covers the brief gap while a guest session starts (first launch, sign-out)
  if (isLoading || (!user && !guestUnavailable)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4ECDC4' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }
  
  return user ? (
    <EventCacheProvider>
      <NavigationContainer>
        <TabNavigator />
      </NavigationContainer>
      <Modal
        visible={!!authPrompt}
        animationType="slide"
        onRequestClose={closeAuthPrompt}
      >
        <AuthModal
          reason={authPrompt?.reason}
          initialMode={authPrompt?.mode}
          onClose={closeAuthPrompt}
        />
      </Modal>
    </EventCacheProvider>
  ) : (
    <AuthModal />
  );
}

export default function App() {
  perfMark('app:mount');

  const [fontsLoaded] = useFonts({
    Shrikhand_400Regular,
  });

  if (fontsLoaded) {
    // Gate: AuthProvider is not mounted until this flips, so the auth listener
    // does not even subscribe before fonts finish loading.
    perfMark('fonts:loaded');
  }

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4ECDC4' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}