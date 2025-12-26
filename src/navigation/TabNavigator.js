import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import SavedScreen from '../screens/SavedScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const getBottomPadding = () => {
  if (Platform.OS === 'web') return 16;
  if (Platform.OS === 'ios') return 24;
  return 12;
};

const getTabBarHeight = () => {
  if (Platform.OS === 'web') return 70;
  if (Platform.OS === 'ios') return 84;
  return 68;
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#eee',
          paddingTop: 8,
          paddingBottom: getBottomPadding(),
          height: getTabBarHeight(),
          position: 'relative',
        },
        tabBarActiveTintColor: '#4ECDC4',
        tabBarInactiveTintColor: '#999',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
      }}
    >
      <Tab.Screen
        name="Discover"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons 
              name={focused ? 'compass' : 'compass-outline'} 
              size={26} 
              color={color} 
            />
          ),
        }}
      />
      <Tab.Screen
        name="Saved"
        component={SavedScreen}
        options={{
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons 
              name={focused ? 'heart' : 'heart-outline'} 
              size={26} 
              color={color} 
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons 
              name={focused ? 'person' : 'person-outline'} 
              size={26} 
              color={color} 
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}