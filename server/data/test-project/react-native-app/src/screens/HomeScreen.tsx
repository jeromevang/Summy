/**
 * Home Screen
 * Main dashboard screen for authenticated users
 */

import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../hooks/useAuth';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
}

const menuItems = [
  { id: '1', title: 'My Profile', screen: 'Profile' },
  { id: '2', title: 'Settings', screen: 'Settings' },
  { id: '3', title: 'Help', screen: 'Help' },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { user, logout } = useAuth();

  const handleMenuPress = (item: typeof menuItems[0]) => {
    if (item.screen === 'Profile') {
      navigation.navigate('Profile', { userId: user?.id || '' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.name || 'User'}!</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={menuItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => handleMenuPress(item)}
          >
            <Text style={styles.menuItemText}>{item.title}</Text>
          </TouchableOpacity>
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  greeting: {
    fontSize: 18,
    fontWeight: '600',
  },
  logoutText: {
    color: '#007AFF',
    fontSize: 16,
  },
  menuItem: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 1,
  },
  menuItemText: {
    fontSize: 16,
  },
});

export default HomeScreen;

