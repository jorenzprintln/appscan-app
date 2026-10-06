import { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, TextInput, FlatList,
  Image, ActivityIndicator, Alert, SafeAreaView, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import DocumentScanner from 'react-native-document-scanner-plugin';

const API_URL = 'http://192.168.1.36/appscan';

export default function App() {
  const [users, setUsers] = useState([]);
  const [user, setUser] = useState(null);
  const [pages, setPages] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api_users.php`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e) {
      Alert.alert('Connection error', 'Cannot reach the server. Check API_URL and Wi-Fi.');
    } finally {
      setLoading(false);
    }
  }

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

  function removePage(i) {
    setPages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function upload() {
    if (!folderName.trim()) return Alert.alert('Folder name is required');
    if (!pages.length) return Alert.alert('Scan at least one page');

    const form = new FormData();
    form.append('user_id', String(user.id));
    form.append('folder_name', folderName.trim());
    pages.forEach((uri, i) => {
      form.append('pages[]', {
        uri,
        name: `page_${i + 1}.jpg`,
        type: 'image/jpeg',
      });
    });

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api_upload.php`, { method: 'POST', body: form });
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

  // ---------- Screen 1: choose user ----------
  if (!user) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.title}>AppScan</Text>
        <Text style={s.muted}>Who is scanning?</Text>
        {loading && <ActivityIndicator style={{ margin: 20 }} />}
        <FlatList
          data={users}
          keyExtractor={(u) => String(u.id)}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.userRow} onPress={() => setUser(item)}>
              <Text style={s.userText}>{item.full_name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={!loading && <Text style={s.muted}>No users found.</Text>}
        />
        <TouchableOpacity style={s.btnOutline} onPress={loadUsers}>
          <Text style={s.btnOutlineText}>Reload</Text>
        </TouchableOpacity>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  // ---------- Screen 2: scan + upload ----------
  return (
    <SafeAreaView style={s.container}>
      <View style={s.row}>
        <Text style={s.title}>Hi, {user.full_name}</Text>
        <TouchableOpacity onPress={() => { setUser(null); setPages([]); }}>
          <Text style={s.link}>Switch</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={s.input}
        placeholder="Folder name"
        value={folderName}
        onChangeText={setFolderName}
        maxLength={150}
      />

      <TouchableOpacity style={s.btn} onPress={scan} disabled={loading}>
        <Text style={s.btnText}>{pages.length ? '+ Scan more pages' : 'Start scanning'}</Text>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1f3a5f', marginBottom: 8 },
  muted: { color: '#777', fontSize: 14 },
  link: { color: '#1f3a5f', fontSize: 16 },
  userRow: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginTop: 8 },
  userText: { fontSize: 16 },
  input: { backgroundColor: '#fff', padding: 12, borderRadius: 8, fontSize: 16, marginVertical: 8 },
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