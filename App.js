import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthModal from './src/components/AuthModal';
import TabNavigator from './src/navigation/TabNavigator';

function AppContent() {
  const { user } = useAuth();
  
  return user ? (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  ) : (
    <AuthModal />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
