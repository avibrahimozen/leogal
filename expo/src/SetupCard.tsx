import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { config, saveKeys } from "./config";

/// One-time setup: paste the two API keys directly in the app. This avoids the
/// fragile `.env` / Windows env-var path entirely — the keys are saved on the
/// device (AsyncStorage) and used immediately.
export function SetupCard({ onSaved }: { onSaved: () => void }) {
  const [anthropic, setAnthropic] = useState(config.anthropicKey);
  const [eleven, setEleven] = useState(config.elevenLabsKey);
  const [voiceId, setVoiceId] = useState(config.elevenLabsVoiceId);
  const [saving, setSaving] = useState(false);

  const canSave = anthropic.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    await saveKeys({ anthropicKey: anthropic, elevenLabsKey: eleven, voiceId });
    setSaving(false);
    onSaved();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.overlay}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Samantha'yı uyandır</Text>
          <Text style={styles.sub}>
            Anahtarları buraya yapıştır — kayıtlı kalır, `.env` gerekmez.
          </Text>

          <Text style={styles.label}>Anthropic anahtarı (beyin) *</Text>
          <TextInput
            style={styles.input}
            value={anthropic}
            onChangeText={setAnthropic}
            placeholder="sk-ant-…"
            placeholderTextColor="#7d7468"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <Text style={styles.label}>ElevenLabs anahtarı (ses + gülme)</Text>
          <TextInput
            style={styles.input}
            value={eleven}
            onChangeText={setEleven}
            placeholder="(opsiyonel — yoksa cihaz sesi kullanılır)"
            placeholderTextColor="#7d7468"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <Text style={styles.label}>Ses tonu (Voice ID — opsiyonel)</Text>
          <TextInput
            style={styles.input}
            value={voiceId}
            onChangeText={setVoiceId}
            placeholder="21m00Tcm4TlvDq8ikWAM"
            placeholderTextColor="#7d7468"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Pressable
            style={[styles.button, !canSave && styles.buttonDisabled]}
            onPress={save}
            disabled={!canSave}
          >
            <Text style={styles.buttonText}>{saving ? "Kaydediliyor…" : "Kaydet ve başla"}</Text>
          </Pressable>

          <View style={styles.links}>
            <Text style={styles.linkRow}>
              Anahtar al:{" "}
              <Text style={styles.link} onPress={() => Linking.openURL("https://console.anthropic.com")}>
                console.anthropic.com
              </Text>
              {"  ·  "}
              <Text style={styles.link} onPress={() => Linking.openURL("https://elevenlabs.io")}>
                elevenlabs.io
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(5,4,2,0.82)",
  },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: "rgba(20,16,12,0.96)",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,180,120,0.25)",
  },
  title: { color: "#ffd68e", fontSize: 22, fontWeight: "700", marginBottom: 4 },
  sub: { color: "#cfc4b6", fontSize: 13, marginBottom: 16, lineHeight: 18 },
  label: { color: "#e8ddcf", fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: {
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontSize: 15,
  },
  button: {
    marginTop: 22,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffb37a",
  },
  buttonDisabled: { backgroundColor: "rgba(255,179,122,0.35)" },
  buttonText: { color: "#1a1208", fontSize: 16, fontWeight: "700" },
  links: { marginTop: 16, alignItems: "center" },
  linkRow: { color: "#9c9488", fontSize: 12 },
  link: { color: "#ffb37a", textDecorationLine: "underline" },
});
