// Web: hızlı yenileme ve hata katmanı için Expo Metro çalışma zamanı (iOS/Android'de etkisiz)
import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
