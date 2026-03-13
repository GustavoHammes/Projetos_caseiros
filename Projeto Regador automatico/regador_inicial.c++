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

// inclui a biblioteca:
#include <LiquidCrystal.h>

// define os pinos de conexão entre o Arduino e o Display LCD
const int rs = 12, en = 11, d4 = 5, d5 = 4, d6 = 3, d7 = 2;
LiquidCrystal lcd(rs, en, d4, d5, d6, d7);

// variáveis do programa
const int pinoSensor = A0;
const int pinoValvula = 10;
const int limiarSeco = 75;
const int limiarMolhado = 40;
const int tempoRega = 50; // Tempo de rega em segundos
int umidadeSolo = 0;

void setup() {
  
  pinMode(pinoValvula, OUTPUT);
  // Desliga a válvula
  digitalWrite(pinoValvula, HIGH);
  // define o tamanho do Display LCD
  lcd.begin(16, 2);
  // Exibe a mensagem no Display LCD.
  lcd.print(" Rega do Manual ");

  Serial.begin(9600);


}

void loop() {
  // Mede a umidade a cada segundo. Faz isso durante uma hora (3600 segundos).
  for(int i=0; i < 5; i++) {
    // Posiciona o cursor do LCD na coluna 0 linha 1
    // (Obs: linha 1 é a segunda linha, a contagem começa em 0
    lcd.setCursor(0, 1);
    // Exibe a mensagem no Display LCD:
    lcd.print("Umidade: ");
    // Faz a leitura do sensor de umidade do solo
    umidadeSolo = analogRead(pinoSensor);
    // Converte a variação do sensor de 0 a 1023 para 0 a 100
    umidadeSolo = map(umidadeSolo, 1023, 0, 0, 100);
    // Exibe a mensagem no Display LCD:
    lcd.print(umidadeSolo);
    lcd.print(" %    ");
    // Espera um segundo
    delay(1000);
  }
  
  if(umidadeSolo < limiarMolhado) {
    // Posiciona o cursor do LCD na coluna 0 linha 1
    // (Obs: linha 1 é a segunda linha, a contagem começa em 0
    lcd.setCursor(0, 1);
    // Exibe a mensagem no Display LCD:
    lcd.print("    Regando     ");
    // Liga a válvula
    digitalWrite(pinoValvula, LOW);
    // Espera o tempo estipulado
    delay(tempoRega*1000);
    digitalWrite(pinoValvula, HIGH);
  }
  else {
    // Posiciona o cursor do LCD na coluna 0 linha 1
    // (Obs: linha 1 é a segunda linha, a contagem começa em 0
    lcd.setCursor(0, 1);
    // Exibe a mensagem no Display LCD:
    lcd.print("Solo Encharcado ");
    // Espera o tempo estipulado
    delay(3000);
  }
}