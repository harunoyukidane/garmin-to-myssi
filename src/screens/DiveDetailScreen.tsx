import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "DiveDetail">;

export function DiveDetailScreen({ navigation, route }: Props) {
  const { dive } = route.params;

  return (
    <Screen>
      <Text style={styles.title}>SSI dive #{dive.ssiDiveNumber}</Text>
      <View style={styles.grid}>
        <Field label="Start" value={new Date(dive.startTime).toLocaleString()} />
        <Field label="Max depth" value={dive.maxDepthM ? `${dive.maxDepthM} m` : "Missing"} />
        <Field label="Duration" value={dive.durationSec ? `${Math.round(dive.durationSec / 60)} min` : "Missing"} />
        <Field label="Temperature" value={dive.waterTempC ? `${dive.waterTempC} C` : "Missing"} />
        <Field label="Location" value={dive.locationName !== undefined ? dive.locationName : "Missing"} />
        <Field label="Notes" value={dive.notes !== undefined ? dive.notes : "None"} />
      </View>
      <PrimaryButton label="Correct location" onPress={() => navigation.navigate("FieldCorrection", { dive, field: "locationName" })} />
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "800"
  },
  grid: {
    gap: 10
  },
  field: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  label: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  value: {
    color: "#0F172A",
    fontSize: 16,
    marginTop: 4
  }
});
