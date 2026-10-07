import { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, TextInput, Image, ActivityIndicator,
  Alert, SafeAreaView, ScrollView, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';

const API_URL = 'http://192.168.1.40/appscan';
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const PLACEHOLDER = '#6b7280';   // darker placeholder so it is readable on white

export default function App() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [keep, setKeep] = useState(true);

  const [pages, setPages] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { restoreSession(); }, []);

  // ---------- saved login ----------
  async function restoreSession() {
    try {
      const t = await SecureStore.getItemAsync(TOKEN_KEY);
      const u = await SecureStore.getItemAsync(USER_KEY);
      if (t && u) {
        setToken(t);
        setUser(JSON.parse(u));
        verifyToken(t); // runs in the background; logs out if the server says it expired
      }
    } catch (e) {
      // nothing saved or storage unavailable: show the login screen
    } finally {
      setBooting(false);
    }
  }

  async function verifyToken(t) {
    try {
      const res = await fetch(`${API_URL}/api_me.php`, { headers: { 'X-Auth-Token': t } });
      if (res.status === 401) await logout(true);
    } catch (e) {
      // server unreachable: keep the saved login, uploads will report the problem
    }
  }

  async function login() {
    if (!email.trim() || !password) return Alert.alert('Enter your email and password');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api_login.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: email.trim(), password }).toString(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      if (keep) {
        await SecureStore.setItemAsync(TOKEN_KEY, data.token);
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
      }
      setToken(data.token);
      setUser(data.user);
      setPassword('');
    } catch (e) {
      const msg = e.message === 'Network request failed'
        ? 'Cannot reach the server. Check API_URL and Wi-Fi.'
        : e.message;
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  }

  async function logout(expired = false) {
    const t = token;
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    } catch (e) {}
    if (t && !expired) {
      // best effort: also remove the token on the server
      fetch(`${API_URL}/api_logout.php`, { method: 'POST', headers: { 'X-Auth-Token': t } }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    setPages([]);
    setFolderName('');
    if (expired) Alert.alert('Session expired', 'Please log in again.');
  }

  // ---------- scanning ----------
  async function scan() {
    try {
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        maxNumDocuments: 24,
        croppedImageQuality: 80,
      });
      if (status === 'success' && scannedImages?.length) {
        setPages((prev) => [...prev, ...scannedImages]);
      }
    } catch (e) {
      Alert.alert('Scan failed', String(e.message || e));
    }
  }

  async function takePhoto() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Camera permission is required');
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        setPages((prev) => [...prev, result.assets[0].uri]);
      }
    } catch (e) {
      Alert.alert('Camera failed', String(e.message || e));
    }
  }

  function removePage(i) {
    setPages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function upload() {
    if (!folderName.trim()) return Alert.alert('Folder name is required');
    if (!pages.length) return Alert.alert('Scan at least one page');

    const form = new FormData();
    form.append('folder_name', folderName.trim());
    pages.forEach((uri) => {
      form.append('pages[]', new File(uri));
    });

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api_upload.php`, {
        method: 'POST',
        headers: { 'X-Auth-Token': token },
        body: form,
      });
      if (res.status === 401) { await logout(true); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      Alert.alert('Saved', `${data.pages} page(s) uploaded.`);
      setPages([]);
      setFolderName('');
    } catch (e) {
      Alert.alert('Upload error', e.message);
    } finally {
      setLoading(false);
    }
  }

  // ---------- loading saved login ----------
  if (booting) {
    return (
      <SafeAreaView style={[s.container, s.center]}>
        <ActivityIndicator size="large" color="#1f3a5f" />
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  // ---------- Screen 1: login ----------
  if (!user) {
    return (
      <SafeAreaView style={[s.container, s.center]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.loginBox}>
          <Text style={s.brand}>AppScan</Text>
          <Text style={[s.muted, { textAlign: 'center', marginBottom: 20 }]}>Sign in to start scanning</Text>

          <Text style={s.label}>Company email</Text>
          <TextInput
            style={s.input}
            placeholder="name@company.com"
            placeholderTextColor={PLACEHOLDER}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
          />

          <Text style={s.label}>Password</Text>
          <View style={s.pwWrap}>
            <TextInput
              style={[s.input, s.pwInput]}
              placeholder="Enter your password"
              placeholderTextColor={PLACEHOLDER}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              textContentType="password"
              onSubmitEditing={login}
            />
            <TouchableOpacity
              style={s.eyeBtn}
              onPress={() => setShowPw((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
            >
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          <View style={s.keepRow}>
            <Switch value={keep} onValueChange={setKeep} trackColor={{ true: '#1f3a5f' }} />
            <Text style={s.keepText}>Keep me signed in</Text>
          </View>

          <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={login} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Log in</Text>}
          </TouchableOpacity>
        </KeyboardAvoidingView>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  // ---------- Screen 2: scan + upload ----------
  return (
    <SafeAreaView style={s.container}>
      <View style={s.row}>
        <Text style={s.title}>Hi, {user.full_name}</Text>
        <TouchableOpacity
          onPress={() => Alert.alert('Log out', 'Log out of AppScan?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: () => logout(false) },
          ])}
        >
          <Text style={s.link}>Log out</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={s.input}
        placeholder="Folder name"
        placeholderTextColor={PLACEHOLDER}
        value={folderName}
        onChangeText={setFolderName}
        maxLength={150}
      />

      <TouchableOpacity style={s.btn} onPress={scan} disabled={loading}>
        <Text style={s.btnText}>{pages.length ? '+ Scan more pages' : 'Start scanning'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btnOutline} onPress={takePhoto} disabled={loading}>
        <Text style={s.btnOutlineText}>Take a photo instead</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.grid}>
        {pages.map((uri, i) => (
          <View key={uri + i} style={s.thumb}>
            <Image source={{ uri }} style={s.img} />
            <Text style={s.muted}>Page {i + 1}</Text>
            <TouchableOpacity onPress={() => removePage(i)}>
              <Text style={s.remove}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[s.btn, (!pages.length || loading) && s.btnDisabled]}
        onPress={upload}
        disabled={!pages.length || loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Upload ({pages.length})</Text>}
      </TouchableOpacity>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f4f7', padding: 16, paddingTop: 40 },
  center: { justifyContent: 'center', alignItems: 'center' },
  loginBox: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  brand: { fontSize: 28, fontWeight: 'bold', color: '#1f3a5f', textAlign: 'center', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 10 },
  pwWrap: { marginVertical: 8 },
  pwInput: { marginVertical: 0, paddingRight: 48 },
  eyeBtn: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center' },
  keepRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 6 },
  keepText: { marginLeft: 8, fontSize: 15, color: '#333' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1f3a5f', marginBottom: 8 },
  muted: { color: '#777', fontSize: 14 },
  link: { color: '#1f3a5f', fontSize: 16 },
  input: { backgroundColor: '#ffffff', color: '#111827', padding: 12, borderRadius: 8, fontSize: 16, marginVertical: 8, borderWidth: 1.5, borderColor: '#cbd5e1' },
  btn: { backgroundColor: '#1f3a5f', padding: 14, borderRadius: 8, alignItems: 'center', marginVertical: 6 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16 },
  btnOutline: { borderColor: '#1f3a5f', borderWidth: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnOutlineText: { color: '#1f3a5f', fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 10 },
  thumb: { width: '30%', alignItems: 'center' },
  img: { width: '100%', aspectRatio: 0.75, borderRadius: 6, borderWidth: 1, borderColor: '#ddd' },
  remove: { color: '#b00020', fontSize: 13, marginTop: 2 },
});