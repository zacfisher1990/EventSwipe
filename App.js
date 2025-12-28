import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthModal from './src/components/AuthModal';
import TabNavigator from './src/navigation/TabNavigator';
import { useFonts, Shrikhand_400Regular } from '@expo-google-fonts/shrikhand';

function AppContent() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4ECDC4' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }
  
  return user ? (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  ) : (
    <AuthModal />
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Shrikhand_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4ECDC4' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}