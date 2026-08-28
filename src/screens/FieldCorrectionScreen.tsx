import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "FieldCorrection">;

export function FieldCorrectionScreen({ navigation, route }: Props) {
  const { dive, field } = route.params;
  const [value, setValue] = useState(String(dive[field] !== undefined ? dive[field] : ""));

  return (
    <Screen>
      <Text style={styles.title}>{field}</Text>
      <TextInput value={value} onChangeText={setValue} style={styles.input} />
      <PrimaryButton label="Save correction" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "800"
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
  }
});
