import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, TextInput, Switch, 
  TouchableOpacity, ActivityIndicator, Alert, Platform 
} from 'react-native';

export default function App() {
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [withThumbnail, setWithThumbnail] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!password || !url) {
      Alert.alert('Aviso', 'Preencha a senha e o link!');
      return;
    }

    setIsDownloading(true);

    // Quando colocar na internet, você vai trocar esse localhost pelo link do seu servidor nas nuvens
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

    const requestUrl = `${BACKEND_URL}?url=${encodeURIComponent(url)}&thumbnail=${withThumbnail}&password=${password}`;

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
      Alert.alert('Erro', 'Não foi possível conectar ao servidor.');
      console.error(error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Baixador de Áudio 🎵</Text>
        <Text style={styles.subtitle}>Baixe áudios com alta qualidade.</Text>

        <TextInput
          style={styles.input}
          placeholder="Senha de acesso"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholderTextColor="#888"
        />

        <TextInput
          style={styles.input}
          placeholder="Cole o link do YouTube aqui"
          value={url}
          onChangeText={setUrl}
          placeholderTextColor="#888"
        />

        <View style={styles.switchContainer}>
          <Text style={styles.switchText}>Incluir Capa (Thumbnail)?</Text>
          <Switch 
            value={withThumbnail} 
            onValueChange={setWithThumbnail}
            trackColor={{ false: "#767577", true: "#81b0ff" }}
            thumbColor={withThumbnail ? "#007bff" : "#f4f3f4"}
          />
        </View>

        {isDownloading ? (
          <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />
        ) : (
          <TouchableOpacity style={styles.button} onPress={handleDownload}>
            <Text style={styles.buttonText}>Baixar Agora</Text>
          </TouchableOpacity>
        )}
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
  switchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 25,
    paddingHorizontal: 5
  },
  switchText: {
    fontSize: 16,
    color: '#333'
  },
  button: { 
    backgroundColor: '#007bff', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center', 
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 5px rgba(0, 123, 255, 0.3)',
      },
      default: {
        shadowColor: '#007bff', 
        shadowOffset: { width: 0, height: 4 }, 
        shadowOpacity: 0.3, 
        shadowRadius: 5, 
      }
    })
  },
});