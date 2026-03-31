import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Requests notification permission and returns the Expo push token.
 * The token can be sent to your backend and used with the Expo Push API:
 *   POST https://exp.host/--/api/v2/push/send
 *   { "to": "<token>", "title": "...", "body": "..." }
 *
 * This is fully open-source and free for up to unlimited pushes.
 */
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.log('[notifications] Must use a physical device for push notifications.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'New Messages',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[notifications] Permission denied.');
    return null;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('[notifications] Push token:', token);
    return token;
  } catch (e) {
    console.log('[notifications] Could not get push token:', e.message);
    return null;
  }
}

/**
 * Fire an immediate local notification — used when a chat message arrives
 * while the user is on a different screen (foreground local alert).
 */
export async function showMessageNotification(username, body) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: username,
      body,
      sound: true,
      channelId: 'messages',
    },
    trigger: null, // show immediately
  });
}
