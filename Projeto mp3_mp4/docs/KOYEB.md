# Koyeb Free — site e API

Estado em 16/10/2026: código preparado e validado localmente. O usuário concluiu o login, mas a conta exibe apenas o aviso de transição para Mistral e configurações administrativas. Não há opção para criar serviços; a página de tokens indicada pela CLI também mostra o mesmo aviso. Nenhum serviço Koyeb foi criado, nenhum token foi gerado e nenhum endereço Koyeb foi validado. O Render anterior permanece separado desta migração.

O [comunicado oficial de 17/02/2026](https://www.koyeb.com/blog/koyeb-is-joining-mistral-ai-to-build-the-future-of-ai-infrastructure) informa que novas contas precisam assinar planos pagos, enquanto organizações existentes no Starter mantêm seu plano. A existência de uma instância chamada `free` na documentação não significa que uma nova conta possa hospedar sem mensalidade. Portanto, este acesso não permitiu concluir o deploy com custo zero. Os passos abaixo ficam como referência para uma organização antiga elegível com acesso ao deploy.

## Configuração preparada

O arquivo `deploy/koyeb-free.json` é o perfil utilizado pelo nosso script `scripts/deploy-koyeb.js`, não um manifesto nativo do Koyeb.

| Campo | Valor |
| --- | --- |
| Aplicativo / serviço | `super-baixador-hammes` / `web` |
| Código | `GustavoHammes/Projetos_caseiros`, branch `codex/profissionalizar-baixador` |
| Work directory | `Projeto mp3_mp4` |
| Builder / Dockerfile | Docker / `Dockerfile` relativo ao work directory |
| Instância | `free`, Washington (`was`) |
| Componentes | Site, Express, yt-dlp com EJS, Node.js e FFmpeg/ffprobe |
| Rede | Porta HTTP 3000, rota `/`, saúde `/api/health` |
| Limites do aplicativo | 50 MB, mídia de até 10 minutos, uma conversão simultânea |
| Tempo de processamento | Até 600 segundos; a interface consulta o estado sem manter a conversão em uma única requisição |
| Retenção | Arquivo pronto expira em cinco minutos se não for retirado |
| Senha | Koyeb Secret `super-baixador-hammes-password`; nunca incluída no Git ou no site |

O Dockerfile existente serve site e API na mesma origem. Não precisa de banco, worker, volume ou Vercel. A instância gratuita permite uma única região e um único serviço gratuito por organização. O armazenamento é temporário e as tarefas se perdem ao reiniciar.

## Conta e custo

Não há contratação autorizada neste projeto. O comunicado oficial restringe novas contas a planos pagos. A FAQ de preços também informa que o cadastro seleciona **Pro**, cobra o valor proporcional do mês e faz uma pré-autorização de US$ 29 no cartão. Usar uma instância `free` dentro do Pro não elimina a mensalidade da conta.

Somente se a organização já tiver Starter, acesso à criação de serviços e elegibilidade sem cobrança, o script poderá criar a instância `free`. Não existe tentativa de usar Nano ou outro recurso pago se Free estiver indisponível. O acesso atual não oferece essas ferramentas, portanto a publicação não foi iniciada. Não foi confirmado cartão, plano pago ou upgrade.

Fontes oficiais: [cobrança e cadastro](https://www.koyeb.com/docs/faqs/pricing), [planos de organização](https://www.koyeb.com/docs/reference/organizations), [instância gratuita](https://www.koyeb.com/docs/reference/instances).

## Publicação

A CLI oficial 5.12.0 foi instalada localmente em `.tools/koyeb/koyeb.exe`, com SHA256 verificado contra o release oficial. Em outra máquina, instale pela [documentação da CLI](https://www.koyeb.com/docs/build-and-deploy/cli/installation). Binários e credenciais não são versionados.

Em uma organização antiga elegível, confira o plano e o acesso ao deploy antes de autenticar a CLI. `koyeb login` solicita um personal access token criado no painel, não reutiliza automaticamente o login do navegador. No acesso atual, essa página não disponibiliza criação de tokens; a tentativa interativa foi encerrada sem inserir credenciais.

```powershell
.tools\koyeb\koyeb.exe login
.tools\koyeb\koyeb.exe whoami
.tools\koyeb\koyeb.exe organizations list
.tools\koyeb\koyeb.exe workspaces list
```

Não cole tokens em conversas nem use `--token` no histórico do terminal. O script usa a autenticação da CLI. Defina os IDs de organização e workspace conferidos no painel; eles não são senhas.

```powershell
$env:KOYEB_ORGANIZATION = 'ID-REAL-DA-ORGANIZACAO'
$env:KOYEB_WORKSPACE = 'ID-REAL-DO-WORKSPACE'
npm run deploy:koyeb
```

Esse comando apenas mostra o plano. Depois de commit e push do código, publique com:

```powershell
npm run deploy:koyeb -- --publish
```

O script envia a senha de `backend/.env` para a criação do Secret via stdin, sem imprimi-la nem colocá-la nos argumentos do processo. Um Secret com esse nome já existente é preservado. Se o aplicativo já tiver serviços, o script interrompe para evitar alterar outra publicação por engano. Confira a senha se reutilizar um Secret criado anteriormente.

O commit atual é fixado em `--git-sha` e deploy automático por push fica desativado. Uma nova versão exige publicação manual pelo painel/CLI. O acesso ao repositório público deve estar disponível para o build; se o Koyeb solicitar conexão com GitHub, conclua a integração no painel antes de tentar novamente.

## Validação após o build

Espere o estado Healthy no painel e use o endereço HTTPS efetivamente atribuído ao aplicativo. A resposta de `/api/health` deve ter `ready: true` e as três dependências disponíveis.

```powershell
$env:TEST_API_URL = 'https://ENDERECO-REAL.koyeb.app'
npm run test:live
```

Isso testa MP3 com capa e MP4 com áudio usando o fluxo de tarefas do site, examinando os arquivos com ffprobe local. O relatório fica em `.artifacts/live-test.json`. Para conferir uma segunda origem pública:

```powershell
$env:TEST_MEDIA_URL = 'https://archive.org/details/Election_Ads/Commercial-Nixon1960ElectionAdToughonDefense.mpg'
npm run test:live
```

YouTube e outras plataformas podem recusar o IP do datacenter. O teste local passou, mas isso não comprova funcionamento no Koyeb. Não foram adicionados cookies pessoais ou proxies. Registre o resultado real, inclusive falhas, antes de considerar a migração concluída.

## Limites relevantes

O [limite HTTP do Koyeb](https://www.koyeb.com/docs/reference/edge-network) é de 100 segundos. A conversão no site usa `POST /api/jobs`, consultas curtas e uma requisição final para o arquivo pronto. Uma transferência final muito lenta ainda pode atingir esse limite. O endpoint antigo `/api/download`, usado pelo Expo, espera a conversão na mesma requisição e deve ser usado com vídeos curtos nesse provedor.

A [instância Free](https://www.koyeb.com/docs/reference/instances) tem 512 MB e 0,1 vCPU, com pausa após uma hora sem tráfego. Não há pings para mantê-la acordada. Arquivos e tarefas não têm persistência garantida. A migração não remove recursos do Render ou Google Cloud; esses serviços devem ser administrados separadamente.
