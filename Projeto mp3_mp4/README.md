# Super Baixador

Site privado em português para salvar áudio MP3 e vídeo MP4. Site e API funcionam no mesmo servidor Node.js, com yt-dlp e FFmpeg. O aplicativo Expo está em `frontend/`; a versão web principal está em `backend/public/` e também pode ser publicada na Vercel.

## Rodar no Windows

Requer Node.js 22 ou superior. Na raiz deste projeto:

```powershell
npm run setup
# Se backend/.env ainda não existir:
Copy-Item backend/.env.example backend/.env
# Edite PASSWORD em backend/.env antes de iniciar.
npm start
```

Abra http://localhost:3000 e informe a senha definida em `backend/.env`. O instalador coloca os binários em `.tools/`, verifica SHA256 dos releases oficiais e instala somente as dependências do backend. Não precisa instalar Expo para usar o site.

```powershell
npm run doctor    # verifica yt-dlp, FFmpeg e ffprobe
npm test          # testes HTTP com download simulado
npm run test:live # downloads reais pela API local, com inspeção por ffprobe
```

Os testes reais usam um vídeo público curto do YouTube. Geram arquivos e relatório em `.artifacts/`, ignorados pelo Git. Para testar outro conteúdo público, defina `TEST_MEDIA_URL`. Para testar uma API publicada, defina também `TEST_API_URL` com a origem HTTPS. A senha é lida do ambiente, sem ser impressa.

## Comportamento

- Áudio MP3 em qualidade variável alta, com metadados e capa opcional.
- Vídeo MP4 com áudio, priorizando H.264/AAC e respeitando o teto de resolução escolhido. A qualidade final depende dos formatos disponíveis na origem.
- Links HTTPS do YouTube, Instagram, TikTok, Vimeo, Internet Archive e Wikimedia Commons; um vídeo por requisição.
- Interface responsiva, mensagens de erro, cancelamento e histórico dos últimos cinco downloads no navegador.
- A senha não é persistida pelo site e é enviada no cabeçalho Authorization. Limpe o campo ao usar um computador compartilhado.
- Diretório temporário exclusivo por download, removido depois do envio, cancelamento ou erro.
- Limites de duração, tamanho, tempo, tentativas por IP e concorrência. Conteúdo privado, transmissões ao vivo e playlists completas não fazem parte do fluxo.
- As plataformas podem restringir downloads por IP, região ou autenticação. Um teste local não garante disponibilidade em um datacenter. Não há tentativa automática de contornar bloqueios.

## Configuração da API

Veja `backend/.env.example`. `PASSWORD` é obrigatório. O padrão local escuta somente em `127.0.0.1`, porta 3000, com até 100 MB, 20 minutos e duas operações simultâneas. Para acesso pela rede local, configure conscientemente `HOST=0.0.0.0` e use o IP do computador.

`ALLOWED_ORIGINS` aceita origens separadas por vírgula. Site e API na mesma origem dispensam CORS. Configure `TRUST_PROXY_HOPS` somente atrás de um proxy reverso conhecido. `YTDLP_PATH` e `FFMPEG_LOCATION` permitem indicar instalações próprias. `YTDLP_COOKIES_FILE` é opcional para Instagram; arquivos de cookies são credenciais e devem permanecer fora do Git e da pasta pública.

```text
GET /api/health
POST /api/download
Authorization: Bearer <PASSWORD>
Content-Type: application/json

{"url":"https://www.youtube.com/watch?v=...","tipo":"audio","qualidade":"720","thumbnail":true}
```

Sucesso: arquivo anexo MP3/MP4. Falha: JSON com `error` e `code`. Códigos principais: 400 (entrada), 401 (senha), 413 (tamanho), 422 (mídia indisponível/restrita), 429 (tentativas/concorrência), 503 (dependências) e 504 (tempo). A saúde responde 200 quando o servidor atende; confira também `ready` para disponibilidade das ferramentas.

`GET /api/download` mantém compatibilidade com o app antigo. Prefira Authorization também no GET; senha na query existe apenas para compatibilidade e pode aparecer nos logs dos intermediários.

## Hospedagem gratuita no Render

O Dockerfile inclui Node.js, Python, yt-dlp com EJS, FFmpeg e ffprobe. Executa como usuário sem privilégios. O `render.yaml` foi preparado para o subdiretório `Projeto mp3_mp4` dentro do repositório `Projetos_caseiros`. Se mover o projeto para um repositório próprio, ajuste `rootDir`.

Configuração recomendada: plano Free, runtime Docker, contexto `Projeto mp3_mp4`, Dockerfile `Projeto mp3_mp4/Dockerfile`, `HOST=0.0.0.0`, `TRUST_PROXY_HOPS=1`, senha privada e origem Vercel autorizada. Use os limites do Blueprint: 50 MB, 10 minutos, um download simultâneo. Nenhum banco, disco persistente ou worker separado é necessário.

O plano Free pausa após 15 minutos sem acesso e pode levar cerca de um minuto para voltar. Os serviços gratuitos do workspace compartilham 750 horas mensais. Tráfego e builds têm franquias: com forma de pagamento, excedentes podem ser cobrados; sem forma de pagamento, o Render suspende os serviços ao exceder os limites. Não use pings para evitar a pausa. Confira a documentação atual: https://render.com/docs/free e https://render.com/docs/faq.

Publicação em outro provedor não cancela recursos nem cobranças da Google Cloud. Confira VM, discos e IPs reservados no console do Google antes de considerar a migração encerrada.

## Manter o domínio da Vercel

A Vercel pode servir a mesma interface sem depender do Expo. O arquivo `frontend/vercel.json` remove o IP fixo antigo. No projeto Vercel:

1. Root Directory: `Projeto mp3_mp4/frontend`.
2. Permita que o build inclua arquivos fora do Root Directory, pois os assets estão em `../backend/public`.
3. Defina `BACKEND_ORIGIN=https://URL-REAL-DA-API` (sem `/api/download`).
4. O build usa `node scripts/build-web.js` e publica `dist/`; instalação do Expo é dispensada.
5. No backend, autorize `https://baixador-mp3.vercel.app` em `ALLOWED_ORIGINS`.

O build falha se a URL da API não estiver configurada, para não publicar uma interface silenciosamente desconectada. Para validar localmente, defina `BACKEND_ORIGIN` e execute `npm --prefix frontend run build:web`. Nenhuma senha é incluída no build.

## App Expo

O código Android/iOS permanece em `frontend/App.js`. Configure `EXPO_PUBLIC_BACKEND_URL` com o endpoint completo, instale as dependências e use `npm --prefix frontend start`. No celular, localhost aponta para o próprio celular; use a origem publicada ou o IP do computador. O código usa `expo-file-system/legacy`, compatível com as APIs empregadas no SDK 54. Testes desta revisão cobrem site e API; a instalação nativa deve ser validada em dispositivo.
