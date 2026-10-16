# API no seu PC

Site e API usam o Node.js do Windows com yt-dlp e FFmpeg. O Cloudflare Quick Tunnel fornece acesso HTTPS ao servidor que escuta somente em `127.0.0.1`. Não exige VM, domínio, cadastro ou cartão para criar esse acesso temporário. A senha de download continua em `backend/.env`.

Estado em 16/10/2026: acesso externo validado com downloads reais de MP3 com capa e MP4 com áudio do YouTube. A publicação da interface atualizada na Vercel está em validação; consulte [VALIDACAO.md](VALIDACAO.md) para o resultado final.

## Usar

Na pasta do projeto, dê dois cliques em:

- `Iniciar servidor.cmd`: inicia em segundo plano e abre o site com o endereço atual.
- `Abrir site.cmd`: abre o site com o endereço atual de um servidor já iniciado.
- `Parar servidor.cmd`: encerra a API e o túnel, cancelando downloads pendentes e limpando temporários.

O início automático foi instalado para o login deste usuário no Windows. Ele inicia os processos sem abrir terminal nem navegador. O PC precisa continuar ligado, sem suspender e conectado à internet. No plano de energia consultado, a suspensão automática na tomada já estava desativada; em bateria, o tempo configurado era dez minutos.

## Endereço temporário

O endereço `https://….trycloudflare.com` muda quando o **túnel** reinicia. Reiniciar apenas a API com `pc:restart` preserva o túnel e seu endereço. O site da Vercel mantém seu endereço próprio.

Quando houver uma URL nova, use `Abrir site.cmd`. O link leva ao site com a sugestão do endereço atual. Confira e clique em **Conectar servidor**. O site testa a saúde da API antes de salvar a origem neste navegador. A senha não é salva e é limpa ao trocar de servidor. Outros navegadores/dispositivos precisam conectar o endereço atual também.

O formulário **Conectar meu servidor** permite colar manualmente o endereço HTTPS mostrado por `pc:status`. Só o endereço é armazenado no navegador. Sugestões recebidas por link não trocam automaticamente o destino dos downloads.

Sem domínio próprio, este acesso é apropriado para uso pessoal e testes: não há garantia de disponibilidade nem endereço permanente. [Limitações oficiais do Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Comandos

```powershell
# Em uma instalação nova, primeiro configure PASSWORD em backend/.env.
npm run setup:pc
npm run pc:start
npm run pc:status
npm run pc:open
npm run pc:restart
npm run pc:stop
```

O instalador verifica SHA256 dos binários oficiais. `pc:start` reaproveita um supervisor já ativo. O supervisor reinicia a API ou o túnel se o processo terminar inesperadamente. O controle usa um pipe local protegido por uma chave em `.artifacts/pc-server/control.key`; não existe rota pública de administração. A parada da API usa IPC para concluir a limpeza antes de encerrar.

Se houver outro servidor ocupando a porta 3000, o programa interrompe a inicialização sem assumir nem encerrar esse processo. Pare a instância antiga de `npm start` antes de usar o supervisor.

## Início automático e arquivos locais

```powershell
npm run pc:autostart         # instalar/reinstalar no login do usuário
npm run pc:autostart:remove  # remover o início automático
```

O launcher fica em `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SuperBaixadorPC.vbs` e aponta para esta pasta do projeto. Remover o início automático não encerra a instância atual; use `pc:stop` para parar.

Arquivos privados de operação ficam fora do Git, em `.artifacts/pc-server/`:

- `status.json`: estado da API e do túnel, URL direta e link do site com o endereço atual.
- `server.log` e `server.previous.log`: logs dos processos, com rotação ao atingir 5 MB.
- `supervisor.log`: erros de inicialização do supervisor.
- `control.key`: chave do controle local; não compartilhar.

`backend/.env`, binários, downloads e artefatos não são incluídos na publicação web.

## Site Vercel

O projeto existente `projetos-caseiros` usa `Projeto mp3_mp4/frontend` como Root Directory, inclui arquivos de fora dessa pasta e publica os assets de `backend/public/`. A variável pública `BACKEND_ORIGIN` contém a origem HTTPS inicial da API. A senha fica somente no PC e é fornecida pelo usuário no formulário de download.

O supervisor autoriza `https://baixador-mp3.vercel.app` no CORS. Nenhuma porta do roteador ou do firewall precisa ser aberta para o túnel.

Para testar a API externa, use a URL atual de `status.json`:

```powershell
$env:TEST_API_URL = (Get-Content .artifacts/pc-server/status.json | ConvertFrom-Json).publicUrl
npm run test:live
```
