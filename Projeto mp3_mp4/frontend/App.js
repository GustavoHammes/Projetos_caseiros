import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, TextInput, Switch, 
  TouchableOpacity, ActivityIndicator, Alert, Platform 
} from 'react-native';

export default function App() {
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [tipo, setTipo] = useState('audio'); // 'audio' ou 'video'
  const [qualidade, setQualidade] = useState('1080'); 
  const [isLoading, setIsLoading] = useState(false); // Estado de carregamento

  // UX: Identifica a plataforma automaticamente pelo link
  const getPlatformInfo = (link) => {
    if (!link) return { nome: 'Nenhuma', cor: '#ccc', icone: '🌐' };
    if (link.includes('instagram.com')) return { nome: 'Instagram', cor: '#E1306C', icone: '📸' };
    if (link.includes('tiktok.com')) return { nome: 'TikTok', cor: '#000000', icone: '🎵' };
    if (link.includes('youtube.com') || link.includes('youtu.be')) return { nome: 'YouTube', cor: '#FF0000', icone: '▶️' };
    return { nome: 'Link Genérico', cor: '#007bff', icone: '🔗' };
  };

  const plataforma = getPlatformInfo(url);

  const handleDownload = async () => {
    if (!url || !password) {
      Alert.alert('Erro', 'Preencha a URL e a senha.');
      return;
    }

    setIsLoading(true); // Liga a bolinha de carregamento

    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
    // Monta a URL enviando todas as escolhas para o servidor
    const requestUrl = `${BACKEND_URL}?url=${encodeURIComponent(url)}&password=${password}&tipo=${tipo}&qualidade=${qualidade}`;

    try {
      if (Platform.OS === 'web') {
        // Lógica da Web: O navegador continua cuidando de tudo sozinho!
        window.location.href = requestUrl; 
      } else {
        // Lógica do Celular
        const FileSystem = require('expo-file-system');
        const Sharing = require('expo-sharing');

        // 1. Baixamos primeiro para um arquivo temporário qualquer
        const tempUri = `${FileSystem.documentDirectory}temp_audio.mp3`;
        const downloadResumable = FileSystem.createDownloadResumable(requestUrl, tempUri);
        
        // 2. O Expo nos devolve o "status" e também os "headers" (onde está o nome do arquivo)
        const { uri, status, headers } = await downloadResumable.downloadAsync();

        if (status === 200) {
          // 3. Procuramos o nome do arquivo que o backend enviou
          const contentDisposition = headers['content-disposition'] || headers['Content-Disposition'];
          let realFileName = `musica_${Date.now()}.mp3`; // Fallback caso dê erro

          if (contentDisposition) {
            // Usa uma expressão regular (RegEx) para pescar o nome dentro do texto do cabeçalho
            const matches = /filename="([^"]+)"/.exec(contentDisposition);
            if (matches != null && matches[1]) {
              realFileName = matches[1];
            }
          }

          // 4. Renomeamos o arquivo temporário para o nome real do vídeo
          const finalUri = `${FileSystem.documentDirectory}${realFileName}`;
          await FileSystem.moveAsync({
            from: uri,
            to: finalUri
          });

          // 5. Compartilha/Salva o arquivo com o nome perfeito!
          await Sharing.shareAsync(finalUri); 
        } else {
          Alert.alert('Erro', 'Senha incorreta ou erro no servidor.');
        }
      }
    } catch (error) {
      Alert.alert('Erro', 'Falha na conexão com o servidor.');
    } finally {
      setIsLoading(false); // Desliga a bolinha independente de dar certo ou erro
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Baixador Universal 🚀</Text>
        <Text style={styles.subtitle}>YouTube, TikTok e Instagram</Text>

        <TextInput
          style={styles.input}
          placeholder="Senha de acesso"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {/* Input da URL com cor dinâmica baseada na plataforma */}
        <TextInput
          style={[styles.input, { borderColor: url ? plataforma.cor : '#ddd', borderWidth: url ? 2 : 1 }]}
          placeholder="Cole o link do vídeo aqui..."
          value={url}
          onChangeText={setUrl}
        />

        {/* UX: Mostra de qual site é o link que o usuário colou */}
        {url ? (
          <Text style={{ color: plataforma.cor, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' }}>
            {plataforma.icone} Link do {plataforma.nome} detectado
          </Text>
        ) : null}

        {/* Abas MP3 / MP4 */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tab, tipo === 'audio' && styles.tabActive]}
            onPress={() => setTipo('audio')}
          >
            <Text style={[styles.tabText, tipo === 'audio' && styles.tabTextActive]}>🎧 Áudio (MP3)</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tab, tipo === 'video' && styles.tabActive]}
            onPress={() => setTipo('video')}
          >
            <Text style={[styles.tabText, tipo === 'video' && styles.tabTextActive]}>🎬 Vídeo (MP4)</Text>
          </TouchableOpacity>
        </View>

        {/* Opções de Qualidade (Aparece SÓ se for Vídeo) */}
        {tipo === 'video' && (
          <View style={styles.qualityContainer}>
            <Text style={styles.qualityLabel}>Qualidade do Vídeo:</Text>
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
        )}

        {/* Botão de Download com Loading */}
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: isLoading ? '#999' : '#007bff' }]} 
          onPress={handleDownload}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Baixar Agora</Text>
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
    backgroundColor: '#f4f7f6',
    padding: 20
  },
  card: { 
    backgroundColor: '#fff', 
    padding: 30, 
    borderRadius: 15, 
    width: '100%', 
    maxWidth: 400, 
    // Usamos Platform.select para dar a sombra certa para Celular ou Web
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 4 }, 
        shadowOpacity: 0.1, 
        shadowRadius: 10, 
        elevation: 5,
      }
    })
  },
  title: { 
    fontSize: 26, 
    fontWeight: 'bold', 
    color: '#333', 
    textAlign: 'center',
    marginBottom: 5 
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25
  },
  input: { 
    backgroundColor: '#f9f9f9',
    borderWidth: 1, 
    borderColor: '#e0e0e0', 
    padding: 15, 
    marginBottom: 15, 
    borderRadius: 8,
    fontSize: 16
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f3f5',
    borderRadius: 10,
    padding: 5,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      web: { boxShadow: '0px 2px 5px rgba(0,0,0,0.1)' },
      default: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1 }
    })
  },
  tabText: { color: '#666', fontWeight: '600' },
  tabTextActive: { color: '#007bff', fontWeight: 'bold' },
  qualityContainer: { marginBottom: 20, alignItems: 'center' },
  qualityLabel: { color: '#555', marginBottom: 8, fontWeight: '500' },
  qualityBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  qualityBtnActive: { backgroundColor: '#343a40' },
  qualityBtnText: { color: '#555', fontWeight: 'bold' },
  qualityBtnTextActive: { color: '#fff', fontWeight: 'bold' },
  button: { padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});