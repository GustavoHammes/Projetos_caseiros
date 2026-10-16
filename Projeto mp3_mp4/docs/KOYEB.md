# Koyeb Free — site e API

Estado em 16/10/2026: código preparado e validado localmente. O painel Koyeb está na tela de login. Nenhum serviço Koyeb foi criado e nenhum endereço Koyeb foi validado. O Render anterior permanece separado desta migração.

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

Antes de confirmar o cadastro, confira o plano da conta. A documentação consultada em 16/10/2026 informa que o cadastro seleciona **Pro**, que cobra o valor proporcional do mês, além de uma pré-autorização de US$ 29 no cartão. Isso é diferente de usar apenas a instância `free`. Não foi autorizado cadastrar cartão, contratar Pro ou criar instância paga neste projeto.

Se a conta já permitir o plano Starter sem cobrança de adesão, o script cria somente a instância `free`. Não existe tentativa de usar Nano ou outro recurso pago se Free estiver indisponível. Se o cadastro exigir contratação paga para continuar, a publicação deve aguardar uma decisão do proprietário.

Fontes oficiais: [cobrança e cadastro](https://www.koyeb.com/docs/faqs/pricing), [planos de organização](https://www.koyeb.com/docs/reference/organizations), [instância gratuita](https://www.koyeb.com/docs/reference/instances).

## Publicação

A CLI oficial 5.12.0 foi instalada localmente em `.tools/koyeb/koyeb.exe`, com SHA256 verificado contra o release oficial. Em outra máquina, instale pela [documentação da CLI](https://www.koyeb.com/docs/build-and-deploy/cli/installation). Binários e credenciais não são versionados.

Após concluir o acesso à conta e conferir o plano, autentique a CLI com o fluxo interativo:

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
