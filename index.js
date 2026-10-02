// Imported first so release builds are quiet before anything else evaluates.
import './src/utils/quietLogs';
// Browser-only layout and dialog setup (empty on iOS and Android).
import './src/utils/webSetup';
// Imported next so its T0 is captured before the app module graph evaluates.
import { perfMark } from './src/utils/perf';

import { registerRootComponent } from 'expo';

import App from './App';

// Everything above (firebase init, i18n + 19 locale bundles, navigation) is
// synchronous module-scope work that lands in this delta.
perfMark('js:module-graph-evaluated');

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
perfMark('js:root-registered');
