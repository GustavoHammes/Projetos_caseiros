# Resultado da validação — 15/10/2026

Site publicado: https://super-baixador-hammes.onrender.com

Serviço Render: `super-baixador-hammes`, plano Free, região Virginia, um download simultâneo, até 50 MB e 10 minutos. O workspace também tem outros serviços: todos compartilham a franquia gratuita. Deploy automático está desativado. Alterações no código exigem um deploy manual no Dashboard após o push da branch `codex/profissionalizar-baixador`.

## Downloads reais

| Ambiente | Origem testada | MP3 | MP4 |
| --- | --- | --- | --- |
| Local | YouTube, vídeo público de 19 s | OK, áudio MP3 e capa | OK, H.264 e áudio AAC |
| Render Free | YouTube, mesmo vídeo | HTTP 422, verificação/autenticação exigida | HTTP 422, verificação/autenticação exigida |
| Render Free | Vimeo, vídeo público | HTTP 422, autenticação/verificação exigida | HTTP 422, autenticação/verificação exigida |
| Render Free | Internet Archive, vídeo de domínio público de 59 s | OK, áudio MP3 e capa | OK, H.264 e áudio AAC |

Arquivos inspecionados com ffprobe, incluindo presença de áudio, duração positiva, contêiner e resolução. Os vídeos testados tinham 240p: a qualidade escolhida é um teto, não aumenta a resolução original. O teste do Internet Archive gerou MP3 de 1.564.442 bytes e MP4 de 4.330.426 bytes. O teste local do YouTube gerou MP3 de 356.606 bytes e MP4 de 744.412 bytes. Os diretórios de trabalho foram limpos após as requisições.

A mensagem do yt-dlp indica restrição da plataforma no contexto do servidor; não comprova que qualquer vídeo da plataforma falhará para sempre. Não foram usados cookies pessoais nem proxies. Instagram e TikTok não foram testados com downloads reais, pois não foi fornecido um link específico.

## Verificações adicionais

- 12 testes Node passaram: autenticação, URLs, anexos, limpeza, concorrência, limites, CORS, compatibilidade GET e timeout.
- Auditoria npm do backend sem vulnerabilidades após atualização das dependências transitivas.
- Health check público retornou `ready: true` com yt-dlp, FFmpeg e ffprobe disponíveis.
- Blueprint validado contra o JSON Schema oficial do Render.
- Interface verificada no navegador, incluindo erro de senha, seleção de qualidade e viewport móvel. Rolagem horizontal corrigida.
- Build estático da Vercel validado; a configuração exige a origem real da API. Publicação no domínio antigo da Vercel não foi executada.
- App Expo recebeu ajustes de autenticação e File System; não foi executado em Android/iOS.

## Reproduzir

`npm run doctor`, `npm test` e `npm run test:live` na raiz. `TEST_API_URL` seleciona a origem da API e `TEST_MEDIA_URL` seleciona um vídeo público permitido. Os relatórios e arquivos de teste ficam em `.artifacts/`, fora do Git. O endpoint `/api/health` indica o estado das ferramentas; ele não garante acesso a todas as plataformas externas.

## Custos

O plano Free do Render pausa após inatividade; não houve contratação de instâncias pagas. Tráfego e builds ainda têm franquias compartilhadas. Se houver cartão cadastrado, o Render pode cobrar excedentes; confira https://render.com/docs/free e https://render.com/docs/faq. O fato de o site estar no Render não encerra recursos ou cobranças da Google Cloud: confira a VM, discos e endereços reservados no console do Google.
