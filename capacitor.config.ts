import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kiranrpn.wealthy",
  appName: "Wealthy?",
  webDir: "dist",
  android: {
    // Matches the dark theme so there is no white flash before the web view paints.
    backgroundColor: "#0b0f19",
  },
};

export default config;
