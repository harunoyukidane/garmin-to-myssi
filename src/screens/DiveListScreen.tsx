import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";

import { assignSsiDiveNumbers } from "../../shared/ssi-mapper";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { sampleDives } from "../services/tripDraft";

type Props = NativeStackScreenProps<RootStackParamList, "DiveList">;

export function DiveListScreen({ navigation, route }: Props) {
  const dives = assignSsiDiveNumbers(sampleDives, route.params.tripConfig.ssiStartDiveNumber);

  return (
    <Screen>
      {dives.map((dive) => (
        <View key={dive.sourceId} style={styles.row}>
          <View>
            <Text style={styles.number}>SSI #{dive.ssiDiveNumber}</Text>
            <Text style={styles.meta}>{new Date(dive.startTime).toLocaleString()}</Text>
            <Text style={styles.meta}>{dive.locationName !== undefined ? dive.locationName : "Location missing"}</Text>
          </View>
          <PrimaryButton label="Open" onPress={() => navigation.navigate("DiveDetail", { dive })} />
        </View>
      ))}
      <PrimaryButton label="Export package" onPress={() => navigation.navigate("Export", { tripConfig: route.params.tripConfig, dives })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  number: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800"
  },
  meta: {
    color: "#475569",
    fontSize: 14,
    marginTop: 4
  }
});
