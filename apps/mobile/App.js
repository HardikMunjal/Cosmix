import { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { registerForPushNotificationsAsync } from './src/utils/notifications';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ChatScreen from './src/screens/ChatScreen';
import OptionsStrategyScreen from './src/screens/OptionsStrategyScreen';
import ExpectedOptionPricesScreen from './src/screens/ExpectedOptionPricesScreen';

// Show notifications even while app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const Stack = createNativeStackNavigator();

export default function App() {
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    // Request notification permission + get push token
    registerForPushNotificationsAsync().then((token) => {
      if (token) console.log('Expo push token:', token);
    });

    // Fired when a notification is received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
    });

    // Fired when user taps a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#e2e8f0',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#020617' },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Cosmix', headerBackVisible: false }} />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Team Chat' }} />
        <Stack.Screen name="OptionsStrategy" component={OptionsStrategyScreen} options={{ title: 'Options Strategy' }} />
        <Stack.Screen name="ExpectedOptionPrices" component={ExpectedOptionPricesScreen} options={{ title: 'Expected Option Prices' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
