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

// --- Definições de Hardware ---
const int rs = 12, en = 11, d4 = 5, d5 = 4, d6 = 3, d7 = 2;
LiquidCrystal lcd(rs, en, d4, d5, d6, d7);

const int pinoSensor = A0;
const int pinoValvula = 10;

// --- Configuração dos Limiares (Histerese) ---
// Rega começa se baixar disso (40%)
const int limiarInferior = 40; 
// Rega para apenas quando atingir isso (75%)
const int limiarSuperior = 75; 

// Tempo de pulso da válvula (evita encharcar de uma vez)
const int tempoPulso = 2000; // 2 segundos de água
const int tempoEspera = 4000; // 4 segundos esperando a água descer

int umidadeSolo = 0;

// --- Função para ler e tratar o sensor ---
// Criação de função para não repetir código (Clean Code!)
int lerSensor() {
  int leitura = analogRead(pinoSensor);
  // Converte: 1023 (seco) = 0%, 0 (molhado) = 100%
  int porcentagem = map(leitura, 1023, 0, 0, 100);
  // Garante que não passe de 0-100 (clamp)
  return constrain(porcentagem, 0, 100);
}

void setup() {
  pinMode(pinoValvula, OUTPUT);
  // Relés geralmente ativam com LOW. HIGH desliga.
  digitalWrite(pinoValvula, HIGH); 
  
  lcd.begin(16, 2);
  lcd.print("  Rega Inteligente  ");
  delay(2000);
  lcd.clear();
  Serial.begin(9600);
}

void loop() {
  // 1. Atualiza leitura
  umidadeSolo = lerSensor();

  // 2. Atualiza Display (Monitoramento)
  lcd.setCursor(0, 0);
  lcd.print("Umidade: ");
  lcd.print(umidadeSolo);
  lcd.print("%    "); // Espaços para limpar caracteres antigos

  lcd.setCursor(0, 1);
  
  // --- LÓGICA PRINCIPAL ---
  
  // Se a umidade cair abaixo de 40%, entra no modo de rega
  if (umidadeSolo < limiarInferior) {
    
    // Entra num loop e só sai quando a terra estiver bem úmida (> 75%)
    while (umidadeSolo < limiarSuperior) {
      
      // AVISO NO LCD
      lcd.setCursor(0, 1);
      lcd.print("Regando...      "); // Feedback visual
      
      // LIGA VÁLVULA
      digitalWrite(pinoValvula, LOW); 
      delay(tempoPulso); // Deixa ligado por um tempinho (ex: 2s)
      
      // DESLIGA VÁLVULA (Pausa para absorção)
      digitalWrite(pinoValvula, HIGH);
      
      lcd.setCursor(0, 1);
      lcd.print("Absorvendo...   ");
      delay(tempoEspera); // Espera a água chegar no sensor (ex: 3s)
      
      // LÊ O SENSOR NOVAMENTE
      // Se agora for > 75%, o 'while' vai dar falso e o loop encerra
      umidadeSolo = lerSensor(); 
      
      // Atualiza a porcentagem na tela durante a rega também
      lcd.setCursor(9, 0); // Posição do número
      lcd.print(umidadeSolo);
      lcd.print("% ");
    }
    
    // Quando sair do while, avisa que terminou
    lcd.setCursor(0, 1);
    lcd.print("Rega Concluida! ");
    delay(2000);
    lcd.clear();
    
  } else {
    // Se não precisa regar, mostra status normal
    lcd.print("Solo OK         ");
    delay(1000); // Atualiza a cada 1 segundo
  }
}