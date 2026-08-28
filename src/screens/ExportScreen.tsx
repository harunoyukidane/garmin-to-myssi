import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";

import { mapToSsiReadyDives } from "../../shared/ssi-mapper";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Export">;

export function ExportScreen({ route }: Props) {
  const mapped = mapToSsiReadyDives(route.params.dives);
  const missingCount = mapped.reduce((count, dive) => count + dive.missingFields.length, 0);

  return (
    <Screen>
      <View style={styles.panel}>
        <Text style={styles.title}>{mapped.length} dives ready</Text>
        <Text style={styles.copy}>SSI numbering starts at {route.params.tripConfig.ssiStartDiveNumber}.</Text>
        <Text style={styles.copy}>{missingCount} fields still need review before manual SSI entry.</Text>
      </View>
      <PrimaryButton label="Generate CSV" onPress={() => undefined} />
      <PrimaryButton label="Generate JSON" onPress={() => undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14
  },
  title: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "800"
  },
  copy: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22
  }
});
