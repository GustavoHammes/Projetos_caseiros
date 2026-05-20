/* ESP32 (WiFi + App no Celular)
Esta versão usa o Blynk IoT. É a forma mais fácil de você ter um App onde pode alterar os valores de 40% e 75% arrastando uma barra, sem precisar reprogramar a placa.
O que você precisa fazer antes:
1- Baixar o App Blynk IoT e criar uma conta.
2- Criar um "Template" e obter o BLYNK_AUTH_TOKEN.
3- No App, criar dois "Sliders" (Datastreams V1 e V2) e um "Gauge" (Datastream V0) para ver a umidade.

Conexões no ESP32 (Diferente do Arduino!):
Relé: Pino D23 (exemplo)
Sensor Solo: Pino D34 (Entrada analógica apenas)
LCD: Se for usar LCD 16x2 antigo no ESP32, precisa de um adaptador I2C, senão gasta muitos pinos. No código abaixo foquei no App, que substitui o LCD físico.*/

/* Preencha com as infos do seu BLYNK */
#define BLYNK_TEMPLATE_ID "TMPL2FnO9hDY3"
#define BLYNK_TEMPLATE_NAME "Regador Inteligente"
#define BLYNK_AUTH_TOKEN "hHwCTiGgw12azq96iSkVFXUVwqZwLgKe"

#include <WiFi.h>
#include <BlynkSimpleEsp32.h>

// Credenciais do WiFi
char auth[] = BLYNK_AUTH_TOKEN;
char ssid[] = "NOME_DO_SEU_WIFI";
char pass[] = "SENHA_DO_SEU_WIFI";

// Pinos
const int PINO_SENSOR = 34; // GPIO 34 (Analog)
const int PINO_VALVULA = 23; // GPIO 23

// Variáveis que o App vai controlar (Valores Padrão)
int limiarSeco = 40;
int limiarMolhado = 75;
bool sistemaAtivo = true; // Botão para desativar rega remotamente

BlynkTimer timer;

// Sincroniza valores quando conecta
BLYNK_CONNECTED() {
  Blynk.syncAll();
}

// O App escreve no Pino Virtual V1 (Limiar Seco)
BLYNK_WRITE(V1) {
  limiarSeco = param.asInt();
}

// O App escreve no Pino Virtual V2 (Limiar Molhado)
BLYNK_WRITE(V2) {
  limiarMolhado = param.asInt();
}

void checarRega() {
  int leitura = analogRead(PINO_SENSOR);
  // ESP32 é 12 bits (0-4095). Ajustar o map:
  int umidade = map(leitura, 4095, 0, 0, 100);
  umidade = constrain(umidade, 0, 100);

  // Envia umidade atual para o App (Gauge V0)
  Blynk.virtualWrite(V0, umidade);

  // Lógica de Rega
  if (sistemaAtivo && umidade < limiarSeco) {
    
    Blynk.logEvent("alerta_rega", "Iniciando a rega automática!"); // Notificação no celular
    
    // Ciclo de rega até atingir a meta
    while (umidade < limiarMolhado) {
      digitalWrite(PINO_VALVULA, HIGH); // Liga (ajuste para LOW se seu relé for invertido)
      delay(2000); 
      digitalWrite(PINO_VALVULA, LOW);  // Desliga
      delay(3000); // Espera absorver

      // Lê de novo
      leitura = analogRead(PINO_SENSOR);
      umidade = map(leitura, 4095, 0, 0, 100);
      Blynk.virtualWrite(V0, umidade); // Atualiza app em tempo real
      
      // Segurança: Processa comandos do WiFi dentro do while
      Blynk.run(); 
    }
    Blynk.logEvent("info_rega", "Rega finalizada com sucesso.");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PINO_VALVULA, OUTPUT);
  digitalWrite(PINO_VALVULA, LOW);

  Blynk.begin(auth, ssid, pass);
  
  // Configura função para rodar a cada 5 segundos (não usar delay no loop do ESP32)
  timer.setInterval(5000L, checarRega);
}

void loop() {
  Blynk.run();
  timer.run();
}