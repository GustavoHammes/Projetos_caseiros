import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, TextInput, Switch, 
  TouchableOpacity, ActivityIndicator, Alert, Platform, Image 
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons'; // Importando as logos oficiais!

export default function App() {
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [tipo, setTipo] = useState('audio');
  const [qualidade, setQualidade] = useState('1080'); 
  const [thumbnail, setThumbnail] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Agora usando os nomes oficiais dos ícones do FontAwesome5
  const getPlatformInfo = (link) => {
    if (!link) return { nome: '', cor: '#ccc', iconName: 'link' };
    if (link.includes('instagram.com')) return { nome: 'Instagram', cor: '#E1306C', iconName: 'instagram' };
    if (link.includes('tiktok.com')) return { nome: 'TikTok', cor: '#000000', iconName: 'tiktok' };
    if (link.includes('youtube.com') || link.includes('youtu.be')) return { nome: 'YouTube', cor: '#FF0000', iconName: 'youtube' };
    return { nome: 'Link Genérico', cor: '#007bff', iconName: 'link' };
  };

  const getThumbnailUrl = (link) => {
    const match = link.match(/[?&]v=([^&]+)/) || link.match(/youtu\.be\/([^?]+)/);
    if (match && match[1]) {
      return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
    return null;
  };

  const plataforma = getPlatformInfo(url);
  const capaUrl = getThumbnailUrl(url);

  const handleDownload = async () => {
    if (!url || !password) {
      Alert.alert('Ops!', 'Preencha a URL e a senha para continuar.');
      return;
    }

    setIsLoading(true);

    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
    const requestUrl = `${BACKEND_URL}?url=${encodeURIComponent(url)}&password=${password}&tipo=${tipo}&qualidade=${qualidade}&thumbnail=${thumbnail}`;

    try {
      if (Platform.OS === 'web') {
        const response = await fetch(requestUrl);
        
        if (!response.ok) {
          const errorMessage = await response.text();
          window.alert(`Erro ao baixar: ${errorMessage}`);
          setIsLoading(false);
          return;
        }

        const blob = await response.blob();
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = tipo === 'video' ? 'video.mp4' : 'audio.mp3'; 
        
        if (contentDisposition && contentDisposition.includes('filename=')) {
          filename = contentDisposition.split('filename=')[1].replace(/"/g, ''); 
          filename = decodeURIComponent(filename); 
        }

        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename; 
        document.body.appendChild(a);
        a.click();
        a.remove();

      } else {
        const FileSystem = require('expo-file-system');
        const Sharing = require('expo-sharing');

        const tempUri = `${FileSystem.documentDirectory}temp_arquivo`;
        const downloadResumable = FileSystem.createDownloadResumable(requestUrl, tempUri);
        
        const { uri, status, headers } = await downloadResumable.downloadAsync();

        if (status === 200) {
          const contentDisposition = headers['content-disposition'] || headers['Content-Disposition'];
          let realFileName = tipo === 'video' ? `video_${Date.now()}.mp4` : `audio_${Date.now()}.mp3`;

          if (contentDisposition) {
            const matches = /filename="([^"]+)"/.exec(contentDisposition);
            if (matches != null && matches[1]) {
              realFileName = matches[1];
            }
          }

          const finalUri = `${FileSystem.documentDirectory}${realFileName}`;
          await FileSystem.moveAsync({ from: uri, to: finalUri });
          await Sharing.shareAsync(finalUri); 
        } else {
          Alert.alert('Erro', 'Verifique a senha ou o link do vídeo.');
        }
      }
    } catch (error) {
      Alert.alert('Erro de Conexão', 'O servidor parece estar offline.');
    } finally {
      setIsLoading(false); 
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Super Baixador</Text>
        <Text style={styles.subtitle}>Baixe mídias com facilidade e qualidade.</Text>

        <TextInput
          style={styles.input}
          placeholder="Senha de acesso"
          placeholderTextColor="#999"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TextInput
          style={[styles.input, { borderColor: url ? plataforma.cor : '#E8E8E8', borderWidth: url ? 2 : 1 }]}
          placeholder="Cole o link (YouTube, Insta, TikTok)..."
          placeholderTextColor="#999"
          value={url}
          onChangeText={setUrl}
        />

        {/* Visualização da Logo + Texto */}
        {url ? (
          <View style={styles.platformContainer}>
            <FontAwesome5 name={plataforma.iconName} size={20} color={plataforma.cor} />
            <Text style={[styles.platformText, { color: plataforma.cor }]}>
              Detectado: {plataforma.nome}
            </Text>
          </View>
        ) : null}

        {capaUrl && (
          <Image 
            source={{ uri: capaUrl }} 
            style={styles.coverImage} 
          />
        )}

        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tab, tipo === 'audio' && styles.tabActive]}
            onPress={() => setTipo('audio')}
          >
            <Text style={[styles.tabText, tipo === 'audio' && styles.tabTextActive]}>🎵 Áudio</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, tipo === 'video' && styles.tabActive]}
            onPress={() => setTipo('video')}
          >
            <Text style={[styles.tabText, tipo === 'video' && styles.tabTextActive]}>🎬 Vídeo</Text>
          </TouchableOpacity>
        </View>

        {tipo === 'video' ? (
          <View style={styles.optionsContainer}>
            <Text style={styles.optionsLabel}>Qualidade:</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {['720', '1080'].map((q) => (
                <TouchableOpacity 
                  key={q}
                  style={[styles.qualityBtn, qualidade === q && styles.qualityBtnActive]}
                  onPress={() => setQualidade(q)}
                >
                  <Text style={[styles.qualityBtnText, qualidade === q && styles.qualityBtnTextActive]}>{q}p</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.switchContainer}>
            <Text style={styles.optionsLabel}>Embutir capa no MP3?</Text>
            <Switch 
              value={thumbnail} 
              onValueChange={setThumbnail} 
              trackColor={{ false: '#ddd', true: '#007bff' }}
            />
          </View>
        )}

        <TouchableOpacity 
          style={[styles.button, { backgroundColor: isLoading ? '#a5c9f3' : '#007bff' }]} 
          onPress={handleDownload}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Text style={styles.buttonText}>Iniciar Download</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#EEF2F5',
    padding: 20
  },
  card: { 
    backgroundColor: '#ffffff', 
    padding: 35, 
    borderRadius: 24,
    width: '100%', 
    maxWidth: 420, 
    ...Platform.select({
      web: { boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.08)' },
      default: { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 15 }
    })
  },
  title: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: '#1A1A1A', 
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginBottom: 30,
    fontWeight: '500'
  },
  input: { 
    backgroundColor: '#F7F9FA',
    borderWidth: 1, 
    borderColor: '#E8E8E8', 
    padding: 16, 
    marginBottom: 16, 
    borderRadius: 14,
    fontSize: 16,
    color: '#333'
  },
  platformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8, // Dá um espacinho elegante entre a logo e o texto
  },
  platformText: {
    fontWeight: '700', 
    fontSize: 15
  },
  coverImage: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    marginBottom: 20,
    resizeMode: 'cover'
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F2F5',
    borderRadius: 14,
    padding: 6,
    marginBottom: 25,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { boxShadow: '0px 4px 10px rgba(0,0,0,0.05)' },
      default: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05 }
    })
  },
  tabText: { color: '#888', fontWeight: '700', fontSize: 15 },
  tabTextActive: { color: '#007bff', fontWeight: '800', fontSize: 15 },
  optionsContainer: { marginBottom: 25, alignItems: 'center' },
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, paddingHorizontal: 10 },
  optionsLabel: { color: '#444', fontWeight: '600', fontSize: 15, marginBottom: 8 },
  qualityBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F0F2F5' },
  qualityBtnActive: { backgroundColor: '#1A1A1A' },
  qualityBtnText: { color: '#666', fontWeight: '700' },
  qualityBtnTextActive: { color: '#fff', fontWeight: '700' },
  button: { 
    padding: 18, 
    borderRadius: 16, 
    alignItems: 'center', 
    marginTop: 5,
    ...Platform.select({
      web: { boxShadow: '0px 8px 20px rgba(0, 123, 255, 0.3)' },
    })
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 }
});