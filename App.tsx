import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TripProvider } from './src/state/TripProvider';
import { DiveDetailScreen, DiveListScreen, ExportScreen, FieldCorrectionScreen, ImportScreen, SsiTransferScreen, TripsScreen, TripSetupScreen } from './src/screens/OfflineScreens';
import { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
export default function App() {
  return <SafeAreaProvider><TripProvider><NavigationContainer><Stack.Navigator initialRouteName="Trips">
    <Stack.Screen name="Trips" component={TripsScreen} options={{ title: 'Dive Log Transfer' }} />
    <Stack.Screen name="TripSetup" component={TripSetupScreen} options={{ title: 'Trip settings' }} />
    <Stack.Screen name="DiveList" component={DiveListScreen} options={{ title: 'Trip dives' }} />
    <Stack.Screen name="Import" component={ImportScreen} options={{ title: 'Import files' }} />
    <Stack.Screen name="DiveDetail" component={DiveDetailScreen} options={{ title: 'Dive review' }} />
    <Stack.Screen name="FieldCorrection" component={FieldCorrectionScreen} options={{ title: 'Correct field' }} />
    <Stack.Screen name="SsiTransfer" component={SsiTransferScreen} options={{ title: "Transfer to MySSI" }} />
    <Stack.Screen name="Export" component={ExportScreen} options={{ title: 'Export' }} />
  </Stack.Navigator></NavigationContainer></TripProvider></SafeAreaProvider>;
}
