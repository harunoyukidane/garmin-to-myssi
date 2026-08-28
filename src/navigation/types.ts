import { DiveRecord, TripConfig } from "../../shared/types";

export type RootStackParamList = {
  SignIn: undefined;
  TripSetup: undefined;
  DiveList: {
    tripConfig: TripConfig;
  };
  DiveDetail: {
    dive: DiveRecord;
  };
  FieldCorrection: {
    dive: DiveRecord;
    field: "maxDepthM" | "durationSec" | "locationName" | "waterTempC" | "notes";
  };
  Export: {
    tripConfig: TripConfig;
    dives: DiveRecord[];
  };
};
