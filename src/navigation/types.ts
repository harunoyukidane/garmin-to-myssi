export type RootStackParamList = {
  Trips: undefined;
  TripSetup: { tripId?: string } | undefined;
  DiveList: { tripId: string };
  Import: { tripId: string };
  DiveDetail: { tripId: string; diveId: string };
  FieldCorrection: { tripId: string; diveId: string; field: import('../../shared/model').EditableField };
  SsiTransfer: { tripId: string; diveId?: string };
  Export: { tripId: string };
};
