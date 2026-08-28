import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { validateTripConfig } from "../../shared/validation";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { sampleTripConfig } from "../services/tripDraft";

type Props = NativeStackScreenProps<RootStackParamList, "TripSetup">;

export function TripSetupScreen({ navigation }: Props) {
  const [tripStartDate, setTripStartDate] = useState(sampleTripConfig.tripStartDate);
  const [tripEndDate, setTripEndDate] = useState(sampleTripConfig.tripEndDate);
  const [ssiStartDiveNumber, setSsiStartDiveNumber] = useState(String(sampleTripConfig.ssiStartDiveNumber));

  const tripConfig = useMemo(
    () => ({
      tripStartDate,
      tripEndDate,
      ssiStartDiveNumber: Number(ssiStartDiveNumber)
    }),
    [ssiStartDiveNumber, tripEndDate, tripStartDate]
  );
  const validation = validateTripConfig(tripConfig);

  return (
    <Screen>
      <View style={styles.field}>
        <Text style={styles.label}>Trip start date</Text>
        <TextInput value={tripStartDate} onChangeText={setTripStartDate} placeholder="YYYY-MM-DD" style={styles.input} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Trip end date</Text>
        <TextInput value={tripEndDate} onChangeText={setTripEndDate} placeholder="YYYY-MM-DD" style={styles.input} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>First SSI dive number</Text>
        <TextInput
          value={ssiStartDiveNumber}
          onChangeText={setSsiStartDiveNumber}
          keyboardType="number-pad"
          placeholder="42"
          style={styles.input}
        />
      </View>
      {!validation.valid && validation.errors.map((error) => <Text key={error} style={styles.error}>{error}</Text>)}
      <PrimaryButton
        label="Review Garmin dives"
        disabled={!validation.valid}
        onPress={() => navigation.navigate("DiveList", { tripConfig })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 8
  },
  label: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12
  },
  error: {
    color: "#B42318",
    fontSize: 14
  }
});
