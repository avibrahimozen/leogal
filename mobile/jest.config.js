/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  // Bu projenin kilit dosyası expo-modules-core'u `expo` paketinin altına yuvalar
  // (node_modules/expo/node_modules). Metro bunu Expo'nun autolinking çözücüsüyle bulur,
  // ama jest-expo'nun kurulum dosyası düz Node çözümlemesiyle kökten arar ve bulamaz.
  // Yuvalı dizini ek arama yolu olarak vermek her iki yerleşimde de çalışır.
  modulePaths: ['<rootDir>/node_modules/expo/node_modules'],
};
