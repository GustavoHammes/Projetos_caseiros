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
    const { url, password, tipo, qualidade } = req.query;

    if (password !== process.env.PASSWORD) {
        return res.status(401).send('Acesso negado.');
    }

    let command = '';

    if (tipo === 'video') {
        command = `yt-dlp --cookies cookies.txt -f "bestvideo[height<=${qualidade}]+bestaudio/best/best" --merge-output-format mp4 -o "downloads/%(title)s.%(ext)s" --restrict-filenames --print "after_move:filepath" "${url}"`;
    } else {
        command = `yt-dlp --cookies cookies.txt -x --audio-format mp3 -o "downloads/%(title)s.%(ext)s" --restrict-filenames --print "after_move:filepath" "${url}"`;
    }

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