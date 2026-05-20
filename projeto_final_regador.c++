/************************************************************
 * Projeto: Regador Automático Inteligente com ESP32
 * Recursos:
 * - Histerese: inicia abaixo de 40%, para acima de 75%
 * - Rega em pulsos: 2s ligado / 3s absorvendo
 * - Cooldown configurável
 * - App Blynk para monitoramento e configuração
 * - Funcionamento offline se Wi-Fi/Blynk cair
 * - Salvamento de configurações na memória NVS do ESP32
 * - RTC DS3231 para manter cooldown mesmo após queda de energia
 ************************************************************/

#define BLYNK_TEMPLATE_ID   "SEU_TEMPLATE_ID"
#define BLYNK_TEMPLATE_NAME "Regador Inteligente"
#define BLYNK_AUTH_TOKEN    "SEU_TOKEN_BLYNK"

#include <WiFi.h>
#include <BlynkSimpleEsp32.h>
#include <Preferences.h>
#include <Wire.h>
#include <RTClib.h>

/* =========================
   Credenciais
   ========================= */
const char WIFI_SSID[] = "NOME_DO_WIFI";
const char WIFI_PASS[] = "SENHA_DO_WIFI";
const char BLYNK_AUTH[] = BLYNK_AUTH_TOKEN;

/* =========================
   Pinos
   ========================= */
const int PINO_SENSOR_UMIDADE = 34;
const int PINO_VALVULA = 23;

/*
   Ajuste conforme seu módulo:
   true  = relé ativo em LOW
   false = relé ativo em HIGH
*/
const bool RELE_ATIVO_EM_LOW = true;

/* =========================
   Calibração do sensor
   =========================
   Faça a calibração real:
   - Valor com sensor no ar/solo seco
   - Valor com sensor em solo bem molhado

   No ESP32 a leitura costuma ir de 0 a 4095.
*/
const int SENSOR_SECO = 4095;
const int SENSOR_MOLHADO = 1500;

/* =========================
   Configurações padrão
   ========================= */
const int LIMIAR_SECO_PADRAO = 40;
const int LIMIAR_MOLHADO_PADRAO = 75;
const int COOLDOWN_HORAS_PADRAO = 12;

const unsigned long TEMPO_PULSO_LIGADO_MS = 2000;
const unsigned long TEMPO_ABSORCAO_MS = 3000;
const unsigned long INTERVALO_LEITURA_MS = 1000;
const unsigned long INTERVALO_ENVIO_APP_MS = 5000;
const unsigned long INTERVALO_RECONEXAO_MS = 30000;

/*
   Segurança: mesmo que o sensor falhe, a rega não fica infinita.
   5 minutos é bastante para protótipo. Ajuste conforme sua vazão.
*/
const unsigned long TEMPO_MAXIMO_REGA_MS = 5UL * 60UL * 1000UL;

/* =========================
   Blynk Virtual Pins
   ========================= */
#define VPIN_UMIDADE       V0
#define VPIN_LIMIAR_SECO   V1
#define VPIN_LIMIAR_UMIDO  V2
#define VPIN_SISTEMA_ATIVO V3
#define VPIN_REGA_MANUAL   V4
#define VPIN_STATUS        V5
#define VPIN_COOLDOWN      V6
#define VPIN_VALVULA       V7
#define VPIN_ULTIMA_REGA   V8

/* =========================
   Objetos globais
   ========================= */
Preferences memoria;
RTC_DS3231 rtc;

/* =========================
   Estado do sistema
   ========================= */
enum EstadoRega {
  MONITORANDO,
  REGANDO_PULSO_LIGADO,
  REGANDO_ABSORVENDO
};

EstadoRega estadoAtual = MONITORANDO;

int limiarSeco = LIMIAR_SECO_PADRAO;
int limiarMolhado = LIMIAR_MOLHADO_PADRAO;
int cooldownHoras = COOLDOWN_HORAS_PADRAO;

bool sistemaAtivo = true;
bool regaManualSolicitada = false;
bool rtcDisponivel = false;

int umidadeAtual = 0;

unsigned long ultimoTempoLeitura = 0;
unsigned long ultimoEnvioApp = 0;
unsigned long ultimaTentativaReconexao = 0;
unsigned long inicioEtapaRega = 0;
unsigned long inicioSessaoRega = 0;

uint32_t ultimaRegaEpoch = 0;

/* =========================
   Funções auxiliares
   ========================= */

void setValvula(bool ligada) {
  if (RELE_ATIVO_EM_LOW) {
    digitalWrite(PINO_VALVULA, ligada ? LOW : HIGH);
  } else {
    digitalWrite(PINO_VALVULA, ligada ? HIGH : LOW);
  }

  if (Blynk.connected()) {
    Blynk.virtualWrite(VPIN_VALVULA, ligada ? 1 : 0);
  }
}

void atualizarStatus(const String& mensagem) {
  Serial.println("[STATUS] " + mensagem);

  if (Blynk.connected()) {
    Blynk.virtualWrite(VPIN_STATUS, mensagem);
  }
}

uint32_t obterEpochAtual() {
  if (rtcDisponivel) {
    return rtc.now().unixtime();
  }

  /*
     Fallback sem RTC:
     usa segundos desde o boot.
     Funciona durante a execução, mas não preserva horário real após queda de energia.
  */
  return millis() / 1000UL;
}

unsigned long cooldownMs() {
  return (unsigned long)cooldownHoras * 60UL * 60UL * 1000UL;
}

bool cooldownPermitido() {
  if (ultimaRegaEpoch == 0) {
    return true;
  }

  uint32_t agora = obterEpochAtual();
  uint32_t cooldownSegundos = (uint32_t)cooldownHoras * 60UL * 60UL;

  return (agora - ultimaRegaEpoch) >= cooldownSegundos;
}

int lerUmidadeSolo() {
  int leituraBruta = analogRead(PINO_SENSOR_UMIDADE);

  int porcentagem = map(
    leituraBruta,
    SENSOR_SECO,
    SENSOR_MOLHADO,
    0,
    100
  );

  return constrain(porcentagem, 0, 100);
}

bool limitesValidos() {
  return limiarSeco >= 0 &&
         limiarMolhado <= 100 &&
         limiarSeco < limiarMolhado;
}

void salvarConfiguracoes() {
  memoria.putInt("limiarSeco", limiarSeco);
  memoria.putInt("limiarMolhado", limiarMolhado);
  memoria.putInt("cooldownHoras", cooldownHoras);
  memoria.putBool("sistemaAtivo", sistemaAtivo);
}

void salvarUltimaRega() {
  ultimaRegaEpoch = obterEpochAtual();
  memoria.putUInt("ultimaRega", ultimaRegaEpoch);
}

void carregarConfiguracoes() {
  memoria.begin("regador", false);

  limiarSeco = memoria.getInt("limiarSeco", LIMIAR_SECO_PADRAO);
  limiarMolhado = memoria.getInt("limiarMolhado", LIMIAR_MOLHADO_PADRAO);
  cooldownHoras = memoria.getInt("cooldownHoras", COOLDOWN_HORAS_PADRAO);
  sistemaAtivo = memoria.getBool("sistemaAtivo", true);
  ultimaRegaEpoch = memoria.getUInt("ultimaRega", 0);

  if (!limitesValidos()) {
    limiarSeco = LIMIAR_SECO_PADRAO;
    limiarMolhado = LIMIAR_MOLHADO_PADRAO;
  }

  cooldownHoras = constrain(cooldownHoras, 1, 24);
}

void iniciarRega(const String& motivo) {
  if (!sistemaAtivo) {
    atualizarStatus("Sistema desativado");
    return;
  }

  if (!cooldownPermitido() && !regaManualSolicitada) {
    atualizarStatus("Cooldown ativo. Rega bloqueada.");
    return;
  }

  if (!limitesValidos()) {
    atualizarStatus("Limiares invalidos");
    return;
  }

  inicioSessaoRega = millis();
  inicioEtapaRega = millis();
  estadoAtual = REGANDO_PULSO_LIGADO;

  setValvula(true);
  atualizarStatus("Regando: " + motivo);
}

void finalizarRega(const String& motivo) {
  setValvula(false);
  estadoAtual = MONITORANDO;
  regaManualSolicitada = false;

  salvarUltimaRega();

  atualizarStatus("Rega finalizada: " + motivo);

  if (Blynk.connected()) {
    Blynk.virtualWrite(VPIN_REGA_MANUAL, 0);
    Blynk.virtualWrite(VPIN_ULTIMA_REGA, ultimaRegaEpoch);
  }
}

void abortarRega(const String& motivo) {
  setValvula(false);
  estadoAtual = MONITORANDO;
  regaManualSolicitada = false;

  atualizarStatus("Rega abortada: " + motivo);

  if (Blynk.connected()) {
    Blynk.virtualWrite(VPIN_REGA_MANUAL, 0);
  }
}

/* =========================
   Lógica principal
   ========================= */

void atualizarLeitura() {
  if (millis() - ultimoTempoLeitura < INTERVALO_LEITURA_MS) {
    return;
  }

  ultimoTempoLeitura = millis();
  umidadeAtual = lerUmidadeSolo();

  Serial.print("Umidade: ");
  Serial.print(umidadeAtual);
  Serial.println("%");
}

void controlarRega() {
  switch (estadoAtual) {
    case MONITORANDO:
      setValvula(false);

      if (regaManualSolicitada) {
        iniciarRega("manual");
        return;
      }

      if (sistemaAtivo && umidadeAtual < limiarSeco && cooldownPermitido()) {
        iniciarRega("solo seco");
      }
      break;

    case REGANDO_PULSO_LIGADO:
      if (millis() - inicioSessaoRega > TEMPO_MAXIMO_REGA_MS) {
        abortarRega("tempo maximo atingido");
        return;
      }

      if (umidadeAtual >= limiarMolhado) {
        finalizarRega("umidade atingida");
        return;
      }

      if (millis() - inicioEtapaRega >= TEMPO_PULSO_LIGADO_MS) {
        setValvula(false);
        inicioEtapaRega = millis();
        estadoAtual = REGANDO_ABSORVENDO;
        atualizarStatus("Absorvendo agua");
      }
      break;

    case REGANDO_ABSORVENDO:
      if (millis() - inicioSessaoRega > TEMPO_MAXIMO_REGA_MS) {
        abortarRega("tempo maximo atingido");
        return;
      }

      if (umidadeAtual >= limiarMolhado) {
        finalizarRega("umidade atingida");
        return;
      }

      if (millis() - inicioEtapaRega >= TEMPO_ABSORCAO_MS) {
        setValvula(true);
        inicioEtapaRega = millis();
        estadoAtual = REGANDO_PULSO_LIGADO;
        atualizarStatus("Novo pulso de rega");
      }
      break;
  }
}

/* =========================
   Comunicação
   ========================= */

void enviarDadosParaApp() {
  if (!Blynk.connected()) {
    return;
  }

  if (millis() - ultimoEnvioApp < INTERVALO_ENVIO_APP_MS) {
    return;
  }

  ultimoEnvioApp = millis();

  Blynk.virtualWrite(VPIN_UMIDADE, umidadeAtual);
  Blynk.virtualWrite(VPIN_LIMIAR_SECO, limiarSeco);
  Blynk.virtualWrite(VPIN_LIMIAR_UMIDO, limiarMolhado);
  Blynk.virtualWrite(VPIN_SISTEMA_ATIVO, sistemaAtivo ? 1 : 0);
  Blynk.virtualWrite(VPIN_COOLDOWN, cooldownHoras);
  Blynk.virtualWrite(VPIN_ULTIMA_REGA, ultimaRegaEpoch);
}

void tentarReconectar() {
  if (millis() - ultimaTentativaReconexao < INTERVALO_RECONEXAO_MS) {
    return;
  }

  ultimaTentativaReconexao = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Tentando reconectar Wi-Fi...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    return;
  }

  if (!Blynk.connected()) {
    Serial.println("Tentando reconectar Blynk...");
    Blynk.connect(3);
  }
}

/* =========================
   Callbacks Blynk
   ========================= */

BLYNK_CONNECTED() {
  atualizarStatus("Blynk conectado");
  Blynk.syncVirtual(VPIN_LIMIAR_SECO);
  Blynk.syncVirtual(VPIN_LIMIAR_UMIDO);
  Blynk.syncVirtual(VPIN_SISTEMA_ATIVO);
  Blynk.syncVirtual(VPIN_COOLDOWN);
  enviarDadosParaApp();
}

BLYNK_WRITE(VPIN_LIMIAR_SECO) {
  int novoValor = param.asInt();

  if (novoValor >= 0 && novoValor < limiarMolhado) {
    limiarSeco = novoValor;
    salvarConfiguracoes();
    atualizarStatus("Limiar seco atualizado");
  } else {
    atualizarStatus("Limiar seco invalido");
  }
}

BLYNK_WRITE(VPIN_LIMIAR_UMIDO) {
  int novoValor = param.asInt();

  if (novoValor > limiarSeco && novoValor <= 100) {
    limiarMolhado = novoValor;
    salvarConfiguracoes();
    atualizarStatus("Limiar molhado atualizado");
  } else {
    atualizarStatus("Limiar molhado invalido");
  }
}

BLYNK_WRITE(VPIN_SISTEMA_ATIVO) {
  sistemaAtivo = param.asInt() == 1;
  salvarConfiguracoes();

  if (!sistemaAtivo && estadoAtual != MONITORANDO) {
    abortarRega("sistema desativado");
  }

  atualizarStatus(sistemaAtivo ? "Sistema ativo" : "Sistema desativado");
}

BLYNK_WRITE(VPIN_REGA_MANUAL) {
  int comando = param.asInt();

  if (comando == 1) {
    regaManualSolicitada = true;
    atualizarStatus("Rega manual solicitada");
  }
}

BLYNK_WRITE(VPIN_COOLDOWN) {
  int novoValor = param.asInt();
  cooldownHoras = constrain(novoValor, 1, 24);
  salvarConfiguracoes();
  atualizarStatus("Cooldown atualizado");
}

/* =========================
   Setup e Loop
   ========================= */

void setup() {
  Serial.begin(115200);

  pinMode(PINO_VALVULA, OUTPUT);
  setValvula(false);

  analogReadResolution(12);
  analogSetPinAttenuation(PINO_SENSOR_UMIDADE, ADC_11db);

  carregarConfiguracoes();

  Wire.begin(21, 22);
  rtcDisponivel = rtc.begin();

  if (!rtcDisponivel) {
    Serial.println("RTC DS3231 nao encontrado. Usando fallback por millis().");
  } else {
    if (rtc.lostPower()) {
      Serial.println("RTC perdeu energia. Ajuste a data/hora antes da apresentacao.");
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Blynk.config(BLYNK_AUTH);

  atualizarStatus("Sistema iniciado");
}

void loop() {
  atualizarLeitura();
  controlarRega();

  tentarReconectar();

  if (Blynk.connected()) {
    Blynk.run();
  }

  enviarDadosParaApp();
}