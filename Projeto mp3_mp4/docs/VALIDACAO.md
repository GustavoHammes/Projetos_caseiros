# Resultado da validação — 16/10/2026

## Resultado atual — Vercel e API no PC

Site: https://baixador-mp3.vercel.app. Deployment de produção `dpl_GWwm2KskVw1xiDPAFtjxqBM2veUb`, estado READY, commit de código `5eb6d0e79f350637f8faae17ad3c2a051ccfe714`, branch `codex/profissionalizar-baixador`. A origem inicial da API foi configurada em `BACKEND_ORIGIN`, sem senha no build.

| Fluxo verificado | MP3 | MP4 |
| --- | --- | --- |
| API no PC pelo HTTPS público | OK, MP3 e capa | OK, H.264 e áudio AAC |
| Formulário em baixador-mp3.vercel.app | OK, arquivo recebido pelo navegador | OK, arquivo recebido pelo navegador |

Origem: vídeo público do YouTube `jNQXAC9IVRw`, 19 segundos. Arquivos dos dois fluxos foram examinados com ffprobe: MP3 de 356.606 bytes, 19,005542 segundos, com capa; MP4 de 744.412 bytes, 19,063583 segundos, H.264/AAC e 240p. A seleção de 720p é um teto; o vídeo de origem é 240p.

Verificações adicionais do servidor pessoal:

- Health check pelo endereço HTTPS retornou `ready: true`, com as três dependências disponíveis. CORS permitiu a origem `https://baixador-mp3.vercel.app`.
- 17 testes HTTP/controles da API passaram nesta revisão.
- Uma tarefa real foi iniciada e o servidor foi parado pelo controle local. API e túnel encerraram; os temporários foram removidos.
- Repetir `pc:start` preservou o supervisor existente. `pc:restart` encerrou a API por IPC, iniciou outro processo e preservou o supervisor e o endereço público do túnel.
- Início automático instalado no Startup deste usuário. Launcher VBS executado com cscript sem erro; não foram criados processos duplicados. Não foi necessário reiniciar o Windows para esse teste.
- Configuração da origem pelo site rejeitou HTTP, validou uma API HTTPS pronta e persistiu após recarregar. A senha não foi armazenada nessa configuração.
- Console do navegador sem erros durante os downloads na Vercel. Senha limpa do formulário após os testes.
- Interface e painel de conexão verificados em viewport 390 × 844: largura útil 375 px, scrollWidth 375 px, sem rolagem horizontal. Viewport restaurado ao final.
- Requisições públicas para `/.env` e `/.artifacts/pc-server/control.key` responderam 404. Temporários vazios depois dos downloads.
- cloudflared 2026.10.1 instalado do release oficial e SHA256 verificado. Node.js, yt-dlp e FFmpeg executam no PC.

Relatórios locais fora do Git: `.artifacts/pc-public-live-test.json`, `.artifacts/pc-recovery-test.json`, `.artifacts/vercel-browser-validation.json` e as capturas do site. O estado/endereço corrente está em `.artifacts/pc-server/status.json`.

O Quick Tunnel muda de endereço ao reiniciar e não oferece SLA. O PC precisa estar ligado, sem suspender e com internet. O site possui configuração de conexão por navegador para atualizar a origem sem novo deploy. Veja [PC_SERVER.md](PC_SERVER.md). A publicação anterior no Render e a tentativa no Koyeb estão documentadas abaixo como histórico.

## Preparação para Koyeb Free

Ainda não publicado: o login Koyeb foi concluído, mas a conta exibe somente o aviso de transição para Mistral e configurações administrativas. Não há ferramentas para criar serviços; a página de tokens indicada pela CLI mostra o mesmo aviso. A CLI solicita um token, e a tentativa foi encerrada sem credenciais. Não houve contratação, criação de token ou de serviço Koyeb. O perfil e o procedimento condicional estão em [KOYEB.md](KOYEB.md).

O [comunicado oficial do Koyeb](https://www.koyeb.com/blog/koyeb-is-joining-mistral-ai-to-build-the-future-of-ai-infrastructure) restringe novas contas a planos pagos e preserva Starter para organizações antigas. Assim, não foi possível publicar gratuitamente com o acesso disponível. A documentação do tipo de instância `free` não basta para afirmar elegibilidade da conta.

A interface passou a criar tarefas, consultar o estado e retirar o arquivo pronto. Isso evita manter a conexão HTTP aberta durante a conversão, pois o Koyeb informa limite de 100 segundos por requisição. Cancelar interrompe o processo e limpa os temporários; arquivos prontos abandonados expiram em cinco minutos. As tarefas compartilham o limite de conversões com o endpoint antigo e há limite de arquivos aguardando retirada.

Verificações realizadas em 16/10/2026:

- 17 testes automatizados passaram, incluindo criação imediata de tarefa enquanto a conversão ainda está pendente, consultas autenticadas sem consumir a franquia de novas solicitações, cancelamento, liberação de vaga, expiração, limite de armazenamento e limpeza após erro.
- `npm run doctor` confirmou yt-dlp 2026.08.19 e FFmpeg/ffprobe 9.0.2.
- Download real do YouTube pela API assíncrona local: MP3 com capa, 356.606 bytes, 19,0055 segundos; MP4 H.264/AAC, 744.412 bytes, 19,0636 segundos, 240p. A origem tem 240p; o seletor define um teto de qualidade.
- Fluxo no navegador local: formulário → criação e consulta de tarefa → arquivo `Me at the zoo [jNQXAC9IVRw].mp3` entregue em Downloads → mensagem de sucesso e histórico. Senha limpa do formulário após o teste.
- Cancelamento de vídeo pelo botão da interface funcionou; nenhuma mensagem de erro no console do navegador durante os testes.
- Diretório temporário vazio após os downloads reais.
- Plano de publicação gerado sem criar recursos; flags conferidas na CLI oficial 5.12.0, incluindo instância `free`, work directory do monorepo, Docker e saúde HTTP.

O funcionamento no IP do Koyeb ainda precisa ser testado após o deploy. A CLI foi baixada do release oficial com SHA256 verificado. Os testes abaixo são históricos da publicação Render em 15/10/2026.

## Publicação Render anterior — 15/10/2026

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
