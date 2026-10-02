// The app version, and the OTA "runtime version": an over-the-air update only
// goes to builds with the same runtime version, so JS updates never land on a
// binary whose native code they weren't built for. Change it with
// `node scripts/bump-version.mjs <version>`, which also updates the native files.
const VERSION = "1.0.27";

export default {
  expo: {
    name: "EventSwipe",
    slug: "EventSwipe",
    version: VERSION,
    runtimeVersion: VERSION,
    updates: {
      url: "https://u.expo.dev/cf67b665-3e15-4bd7-a8b9-a477c2f5711e"
    },
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#4ECDC4"
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.eventswipeapp.eventswipe",
      buildNumber: "21",
      usesAppleSignIn: true,
      entitlements: {
        "aps-environment": "development"
      },
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "EventSwipe uses your location to find events near you.",
        NSPhotoLibraryUsageDescription: "EventSwipe needs access to your photo library so you can select images to include with events you create and share with other users.",
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#4ECDC4"
      },
      edgeToEdgeEnabled: true,
      androidStatusBar: {
        barStyle: "dark-content"
      },
      package: "com.eventswipeapp.eventswipe",
      googleServicesFile: "./android/app/google-services.json",
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY,
        }
      },
      permissions: [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-font",
      ["expo-location", {
        locationWhenInUsePermission: "EventSwipe uses your location to find events near you."
      }],
      "@react-native-community/datetimepicker",
      "expo-localization",
      "expo-apple-authentication",
      ["@react-native-google-signin/google-signin", {
        iosUrlScheme: "com.googleusercontent.apps.989696282130-15kcfirqltmh2dd4fdju95lk11gmee1n"
      }],
      ["expo-notifications", {
        color: "#4ECDC4"
      }]
    ],
    extra: {
      eas: {
        projectId: "cf67b665-3e15-4bd7-a8b9-a477c2f5711e"
      }
    },
    owner: "zcfshr1990"
  }
};