import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../store/auth';
import { colors } from '../theme';
import DriverRegisterScreen from '../screens/DriverRegisterScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RegisterScreen from '../screens/RegisterScreen';
import RideHistoryScreen from '../screens/RideHistoryScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import DriverHomeScreen from '../screens/driver/DriverHomeScreen';
import EarningsScreen from '../screens/driver/EarningsScreen';
import PassengerHomeScreen from '../screens/passenger/PassengerHomeScreen';
import type { AuthStackParamList, DriverTabParamList, PassengerTabParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const PassengerTabs = createBottomTabNavigator<PassengerTabParamList>();
const DriverTabs = createBottomTabNavigator<DriverTabParamList>();

function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.ink,
  tabBarInactiveTintColor: colors.muted,
  tabBarStyle: { backgroundColor: colors.card },
} as const;

function PassengerNavigator() {
  return (
    <PassengerTabs.Navigator screenOptions={tabScreenOptions}>
      <PassengerTabs.Screen
        name="PassengerHome"
        component={PassengerHomeScreen}
        options={{ title: 'Taksi Çağır', tabBarIcon: tabIcon('car') }}
      />
      <PassengerTabs.Screen
        name="History"
        component={RideHistoryScreen}
        options={{ title: 'Yolculuklar', tabBarIcon: tabIcon('time') }}
      />
      <PassengerTabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profil', tabBarIcon: tabIcon('person') }}
      />
    </PassengerTabs.Navigator>
  );
}

function DriverNavigator() {
  return (
    <DriverTabs.Navigator screenOptions={tabScreenOptions}>
      <DriverTabs.Screen
        name="DriverHome"
        component={DriverHomeScreen}
        options={{ title: 'Çağrılar', tabBarIcon: tabIcon('car') }}
      />
      <DriverTabs.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{ title: 'Kazanç', tabBarIcon: tabIcon('wallet') }}
      />
      <DriverTabs.Screen
        name="History"
        component={RideHistoryScreen}
        options={{ title: 'Yolculuklar', tabBarIcon: tabIcon('time') }}
      />
      <DriverTabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profil', tabBarIcon: tabIcon('person') }}
      />
    </DriverTabs.Navigator>
  );
}

export default function RootNavigator() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <AuthStack.Navigator
          screenOptions={{
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.bg },
          }}
        >
          <AuthStack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
          <AuthStack.Screen name="Login" component={LoginScreen} options={{ title: 'Giriş Yap' }} />
          <AuthStack.Screen name="Register" component={RegisterScreen} options={{ title: 'Kaydol' }} />
          <AuthStack.Screen
            name="DriverRegister"
            component={DriverRegisterScreen}
            options={{ title: 'Sürücü Başvurusu' }}
          />
        </AuthStack.Navigator>
      ) : user.role === 'driver' ? (
        <DriverNavigator />
      ) : (
        <PassengerNavigator />
      )}
    </NavigationContainer>
  );
}
