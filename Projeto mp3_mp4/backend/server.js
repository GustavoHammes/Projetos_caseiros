const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
const PORT = 3000;

// Rota de download (usamos GET para facilitar o download no app)
app.get('/api/download', (req, res) => {
    const { url, thumbnail, password } = req.query;

    if (password !== process.env.PASSWORD) {
    return res.status(401).send('Acesso negado. Senha incorreta.');
    }
    if (!url) {
        return res.status(400).send('URL do vídeo é obrigatória.');
    }

    // O Segredo: 
    // %(title)s pega o título do vídeo original.
    // --restrict-filenames remove emojis, espaços bizarros e acentos que quebram o sistema.
    // --print "after_move:filepath" avisa ao Node o nome final do arquivo gerado.
    let command = `yt-dlp -x --audio-format mp3 -o "downloads/%(title)s.%(ext)s" --restrict-filenames --print "after_move:filepath"`;
    
    if (thumbnail === 'true') {
        command += ` --embed-thumbnail`;
    }
    command += ` "${url}"`;

    console.log('Baixando áudio com nome original...');

    // Executa o comando
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('Erro:', error);
            return res.status(500).send('Erro ao baixar o áudio.');
        }

        // O "stdout" é a resposta do yt-dlp. O .trim() limpa as quebras de linha.
        // O resultado vai ser algo como: "downloads/Nome_do_Video.mp3"
        const finalFilePath = stdout.trim(); 
        
        // Extrai só o nome (tirando a parte "downloads/") para enviar no cabeçalho da resposta
        const fileName = path.basename(finalFilePath);

        // Envia o arquivo de volta. O Node automaticamente diz ao navegador o nome correto.
        res.download(finalFilePath, fileName, (err) => {
            if (!err) {
                fs.unlinkSync(finalFilePath); // Apaga o arquivo do servidor depois que o usuário baixar
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});