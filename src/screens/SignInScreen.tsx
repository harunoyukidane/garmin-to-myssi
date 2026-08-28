import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "SignIn">;

export function SignInScreen({ navigation }: Props) {
  return (
    <Screen>
      <View style={styles.panel}>
        <Text style={styles.title}>Garmin dive transfer</Text>
        <Text style={styles.copy}>
          Start with Garmin export files for the MVP. The approved Garmin account adapter can plug into the same import path later.
        </Text>
      </View>
      <PrimaryButton label="Set up trip" onPress={() => navigation.navigate("TripSetup")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 10
  },
  title: {
    color: "#0F172A",
    fontSize: 28,
    fontWeight: "800"
  },
  copy: {
    color: "#475569",
    fontSize: 16,
    lineHeight: 23
  }
});
