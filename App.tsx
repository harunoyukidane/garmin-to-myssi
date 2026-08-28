import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DiveDetailScreen } from "./src/screens/DiveDetailScreen";
import { DiveListScreen } from "./src/screens/DiveListScreen";
import { ExportScreen } from "./src/screens/ExportScreen";
import { FieldCorrectionScreen } from "./src/screens/FieldCorrectionScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { TripSetupScreen } from "./src/screens/TripSetupScreen";
import { RootStackParamList } from "./src/navigation/types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="SignIn">
          <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: "Garmin" }} />
          <Stack.Screen name="TripSetup" component={TripSetupScreen} options={{ title: "Trip Setup" }} />
          <Stack.Screen name="DiveList" component={DiveListScreen} options={{ title: "Trip Dives" }} />
          <Stack.Screen name="DiveDetail" component={DiveDetailScreen} options={{ title: "Dive Review" }} />
          <Stack.Screen name="FieldCorrection" component={FieldCorrectionScreen} options={{ title: "Correct Field" }} />
          <Stack.Screen name="Export" component={ExportScreen} options={{ title: "Export" }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
