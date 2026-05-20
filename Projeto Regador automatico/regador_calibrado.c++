/* ******************** Rega Automática do Manual do Mundo ********************
   Guia de conexão:
   LCD RS: pino 12
   LCD Enable: pino 11
   LCD D4: pino 5
   LCD D5: pino 4
   LCD D6: pino 3
   LCD D7: pino 2
   LCD R/W: GND
   LCD VSS: GND
   LCD VCC: VCC (5V)
   Potenciômetro de 10K terminal 1: GND
   Potenciômetro de 10K terminal 2: V0 do LCD (Contraste)
   Potenciômetro de 10K terminal 3: VCC (5V)
   Sensor de umidade do solo A0: Pino A0
   Módulo Relé (Válvula): Pino 10   
 ***************************************************************************** */
#include <LiquidCrystal.h>

/* --- CONFIGURAÇÕES DO USUÁRIO --- */
// Limites de umidade
const int LIMIAR_SECO = 40;       // Começa a regar aqui
const int LIMIAR_MOLHADO = 75;    // Para de regar aqui

// Proteção de Frequência (Ex: Regar no máximo a cada 12 horas)
// 1 hora = 3600000 ms. 
// Para 12 horas: 12 * 3600000 = 43200000
const unsigned long INTERVALO_ENTRE_REGAS = 43200000; 

// Pinos (Manual do Mundo padrão)
const int pinoSensor = A0;
const int pinoValvula = 10;
const int rs = 12, en = 11, d4 = 5, d5 = 4, d6 = 3, d7 = 2;

LiquidCrystal lcd(rs, en, d4, d5, d6, d7);
unsigned long ultimaRega = 0; // Armazena quando foi a última rega

// Função para ler o sensor com precisão
int lerSensor() {
  int leitura = analogRead(pinoSensor);
  // OBS: Calibre estes valores 1023 e 0 conforme seu sensor real
  int pct = map(leitura, 1023, 0, 0, 100); 
  return constrain(pct, 0, 100);
}

void setup() {
  pinMode(pinoValvula, OUTPUT);
  digitalWrite(pinoValvula, HIGH); // Começa desligado (HIGH para relé comum)
  lcd.begin(16, 2);
  lcd.print("Sistema Iniciado");
  delay(2000);
  lcd.clear();
  
  // Força que a variável de tempo permita regar logo ao ligar, se necessário
  // (Subtrai o intervalo para garantir que a conta dê positivo)
  ultimaRega = millis() - INTERVALO_ENTRE_REGAS; 
}

void loop() {
  int umidade = lerSensor();
  unsigned long agora = millis();
  
  // Mostra no LCD
  lcd.setCursor(0, 0);
  lcd.print("Umidade: ");
  lcd.print(umidade);
  lcd.print("%   ");
  
  // Verifica se já passou o tempo necessário desde a última rega
  // A função abs() ajuda a evitar problemas quando o timer do Arduino 'vira' (após 50 dias ligado)
  bool tempoPermitido = (agora - ultimaRega >= INTERVALO_ENTRE_REGAS);

  lcd.setCursor(0, 1);
  if (!tempoPermitido) {
    lcd.print("Aguardando Tempo");
  } else {
    lcd.print("Monitorando...  ");
  }

  // LÓGICA DE REGA
  if (umidade < LIMIAR_SECO && tempoPermitido) {
    
    lcd.clear();
    
    // Loop de Enchimento (Histerese)
    while (lerSensor() < LIMIAR_MOLHADO) {
      lcd.setCursor(0, 0);
      lcd.print("Regando...");
      lcd.setCursor(0, 1);
      lcd.print("Atual: ");
      lcd.print(lerSensor());
      lcd.print("% -> ");
      lcd.print(LIMIAR_MOLHADO);
      lcd.print("%");
      
      // Pulso de água (2s liga, 3s desliga para absorver)
      digitalWrite(pinoValvula, LOW);
      delay(2000);
      digitalWrite(pinoValvula, HIGH);
      delay(3000);
    }
    
    // Ao sair do loop, atualiza o timer
    ultimaRega = millis();
    lcd.clear();
    lcd.print("Rega Concluida");
    delay(2000);
    lcd.clear();
  }
  
  delay(1000); // Atualiza leitura geral a cada segundo
}