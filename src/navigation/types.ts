export type RootStackParamList = {
  Trips: undefined;
  GarminConnection: { tripId?: string } | undefined;
  GarminSync: { tripId: string };
  TripSetup: { tripId?: string } | undefined;
  DiveList: { tripId: string };
  Import: { tripId: string };
  DiveDetail: { tripId: string; diveId: string; edit?: boolean };
  FieldCorrection: { tripId: string; diveId: string; field: import('../../shared/model').EditableField };
  SsiSettings: undefined;
};
