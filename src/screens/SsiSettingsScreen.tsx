import React, { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTrips } from '../state/TripProvider';
import { conditionFields, conditionLabel, conditionOptions, ConditionField, defaultSsiConditions, resolveSsiConditions, SsiConditions } from '../../shared/ssiConditions';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';

export function ConditionEditor({ values, onChange, recorded, defaults }: { values: SsiConditions; onChange: (value: SsiConditions) => void; recorded?: SsiConditions; defaults?: SsiConditions }) {
  const { busy } = useTrips();
  const [expanded, setExpanded] = useState<ConditionField>();
  const resolved = resolveSsiConditions(recorded, values, defaults);
  return <View style={{ gap: 10 }}>{conditionFields.map(key => <View key={key} style={{ gap: 6 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === key }} disabled={busy} onPress={() => setExpanded(expanded === key ? undefined : key)} style={{ padding: 12, borderBottomWidth: 1, borderColor: '#D5E2E5' }}><Text>{conditionOptions[key].label}: {conditionLabel(key, resolved[key])} ▾</Text></Pressable>
    {expanded === key && <>
      <PrimaryButton label="Use recorded / default value" disabled={busy} onPress={() => { const next = { ...values }; delete next[key]; onChange(next); setExpanded(undefined); }} />
      {conditionOptions[key].values.map(([id, label]) => <PrimaryButton key={id} label={label} disabled={busy} onPress={() => { onChange({ ...values, [key]: id }); setExpanded(undefined); }} />)}
      <PrimaryButton label="Leave blank in SSI QR" disabled={busy} onPress={() => { onChange({ ...values, [key]: null }); setExpanded(undefined); }} />
    </>}
  </View>)}</View>;
}
export function ConditionSummary({ values, recorded, defaults }: { values?: SsiConditions; recorded?: SsiConditions; defaults?: SsiConditions }) {
  const resolved = resolveSsiConditions(recorded, values, defaults);
  return <Text style={{ color: '#334155', lineHeight: 24 }}>{conditionFields.map(key => `${conditionOptions[key].label}: ${conditionLabel(key, resolved[key])}`).join('\n')}</Text>;
}
export function ConditionSettings({ values, onChange }: { values: SsiConditions; onChange: (value: SsiConditions) => void }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(values);
  return <><ConditionSummary values={values} /><PrimaryButton label="Edit SSI QR defaults" onPress={() => { setDraft({ ...values }); setEditing(true); }} />
    <Modal visible={editing} animationType="slide" onRequestClose={() => setEditing(false)}><Screen><Text style={{ fontSize: 25, fontWeight: '800' }}>Edit SSI QR defaults</Text><ConditionEditor values={draft} onChange={setDraft} /><PrimaryButton label="Done" onPress={() => { onChange(draft); setEditing(false); }} /><PrimaryButton label="Cancel" onPress={() => setEditing(false)} /></Screen></Modal></>;
}
export function AirInput({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder?: string }) {
  const { busy } = useTrips();
  return <View style={{ gap: 6 }}><Text>Air temperature (°C, optional)</Text><TextInput accessibilityLabel="Air temperature in Celsius" editable={!busy} value={value} onChangeText={onChange} placeholder={placeholder} keyboardType="numbers-and-punctuation" style={{ borderWidth: 1, borderColor: '#94A3B8', padding: 12, borderRadius: 8, minHeight: 48, color: '#0F172A' }} /></View>;
}
export function parseAir(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < -100 || number > 70) throw new Error('Air temperature must be between -100 and 70 °C.');
  return number;
}
export function SsiSettingsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'SsiSettings'>) {
  const { data, busy, run, saveSsiDefaults } = useTrips();
  const [values, setValues] = useState<SsiConditions>({ ...defaultSsiConditions, ...data.ssiDefaults });
  return <Screen><Text style={{ fontSize: 25, fontWeight: '800' }}>Global SSI QR Settings</Text>
    <Text>Copied into new trips. Existing trips keep their settings; use Apply global settings in Trip Settings to update a trip.</Text>
    <ConditionSettings values={values} onChange={setValues} />
    <PrimaryButton label="Reset to original defaults" disabled={busy} onPress={() => setValues({ ...defaultSsiConditions })} />
    <PrimaryButton label="Save settings" disabled={busy} onPress={() => run(async () => { await saveSsiDefaults(values); navigation.goBack(); })} />
  </Screen>;
}
