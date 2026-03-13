# 🎵 Baixador de Áudio do YouTube

Um aplicativo Fullstack multiplataforma (Web, Android e iOS) para baixar áudios do YouTube em alta qualidade (MP3) com suporte a extração de capa (thumbnail) original do vídeo.

## 🚀 Tecnologias Utilizadas
- **Frontend:** React Native, Expo, Expo File System, Expo Sharing.
- **Backend:** Node.js, Express, yt-dlp, FFmpeg.

## ⚙️ Funcionalidades
- Download de vídeos diretamente em formato MP3.
- Opção para embutir a thumbnail do vídeo como capa do arquivo de áudio.
- Sistema de proteção por senha (acesso privado).
- Download direto pelo navegador (Web) ou salvamento no armazenamento interno nativo (iOS/Android).

## 🛠️ Como rodar o projeto localmente

### Backend
1. Entre na pasta do backend e rode `npm install`.
2. Certifique-se de ter o `yt-dlp` e o `FFmpeg` instalados na sua máquina.
3. Crie um arquivo `.env` e defina sua senha: `PASSWORD=suasenha`.
4. Inicie o servidor com `node server.js`.

### Frontend
1. Entre na pasta do frontend e rode `npm install`.
2. Crie um arquivo `.env` com a URL do seu backend: `EXPO_PUBLIC_BACKEND_URL=http://localhost:3000/api/download`.
3. Rode `npx expo start` para testar no celular ou `npx expo start --web` para o navegador.