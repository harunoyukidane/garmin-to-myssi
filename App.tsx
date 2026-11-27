import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TripProvider } from './src/state/TripProvider';
import { DiveDetailScreen, DiveListScreen, FieldCorrectionScreen, ImportScreen, TripsScreen, TripSetupScreen } from './src/screens/OfflineScreens';
import { RootStackParamList } from './src/navigation/types';
import { GarminConnectionScreen, GarminSyncScreen } from './src/screens/GarminScreens';
import { SsiSettingsScreen } from './src/screens/SsiSettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
export default function App() {
  return <SafeAreaProvider><TripProvider><NavigationContainer><Stack.Navigator initialRouteName="Trips">
    <Stack.Screen name="Trips" component={TripsScreen} options={{ title: 'Dive Log Transfer' }} />
    <Stack.Screen name="SsiSettings" component={SsiSettingsScreen} options={{ title: 'Global SSI QR Settings' }} />
    <Stack.Screen name="GarminConnection" component={GarminConnectionScreen} options={{ title: 'Garmin & GeoNames settings' }} />
    <Stack.Screen name="GarminSync" component={GarminSyncScreen} options={{ title: 'Sync Garmin' }} />
    <Stack.Screen name="TripSetup" component={TripSetupScreen} options={{ title: 'Trip settings' }} />
    <Stack.Screen name="DiveList" component={DiveListScreen} options={{ title: 'Trip dives' }} />
    <Stack.Screen name="Import" component={ImportScreen} options={{ title: 'Import files' }} />
    <Stack.Screen name="DiveDetail" component={DiveDetailScreen} options={{ title: 'Dive review' }} />
    <Stack.Screen name="FieldCorrection" component={FieldCorrectionScreen} options={{ title: 'Correct field' }} />
  </Stack.Navigator></NavigationContainer></TripProvider></SafeAreaProvider>;
}
