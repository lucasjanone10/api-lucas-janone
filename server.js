require('dotenv').config();
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const pdfsDir = path.join(__dirname, 'public', 'pdfs');
if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
}
app.use('/pdfs', express.static(pdfsDir));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/gerar-roteiro', async (req, res) => {
    try {
        const { nome, dataViagem, numeroViajantes, destino, orcamento, mustHaves } = req.body;
        
        console.log(`[LOG] Recebido pedido de roteiro para: ${nome} - Destino: ${destino}`);

        const prompt = `Você é Lucas Janone, um renomado especialista em viagens. Crie um roteiro premium.
        Cliente: ${nome} | Destino: ${destino} | Data: ${dataViagem} | Viajantes: ${numeroViajantes} | Orçamento: ${orcamento} | Exigências: ${mustHaves}
        
        Regras: Responda APENAS com código HTML estruturado (sem tags html, head ou body, apenas o conteúdo interno).
        Use <h2> para dias, <h3> para refeições/passeios, <p> para textos persuasivos, e <ul>/<li> para listas.
        
        Estrutura obrigatória:
        1. Boas-vindas calorosas ao ${nome}.
        2. Visão geral de como o orçamento foi otimizado.
        3. Roteiro Dia a Dia (Manhã, Tarde, Noite) incluindo os pedidos especiais.
        4. 3 Curiosidades locais.
        5. 'A Dica de Ouro do Lucas' para evitar perrengues.
        Termine com uma chamada sutil para a Mentoria de Viagens.`;

        // CORREÇÃO 1: Usando o modelo flash (mais rápido e não dá erro 404)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        let roteiroHTML = result.response.text();

        roteiroHTML = roteiroHTML.replace(/```html|```/g, '');

        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
                body { font-family: 'Inter', sans-serif; color: #1A365D; background-color: #F8FAFC; margin: 0; padding: 40px; line-height: 1.6; }
                .header { text-align: center; border-bottom: 3px solid #FF6B35; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { font-size: 28px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
                .header p { color: #64748B; font-size: 14px; }
                .content h2 { background-color: #1A365D; color: white; padding: 10px 15px; border-radius: 8px; font-size: 20px; margin-top: 30px; }
                .content h3 { color: #FF6B35; font-size: 18px; margin-bottom: 5px; }
                .content p, .content ul { font-size: 14px; color: #334155; }
                .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Seu Roteiro Exclusivo</h1>
                <p>Criado sob medida por Lucas Janone (IA)</p>
            </div>
            <div class="content">${roteiroHTML}</div>
            <div class="footer"><p>Preparado exclusivamente para ${nome}. Pronto para tirar do papel? Fale com a equipe Lucas Janone.</p></div>
        </body>
        </html>`;

        // CORREÇÃO 2: Adicionando argumentos de segurança para a Render aceitar o gerador de PDF
        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ path: filePath, format: 'A4', printBackground: true });
        await browser.close();

        // CORREÇÃO 3: Gerando o link real da internet em vez do localhost
        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        console.log(`[LOG] PDF gerado com sucesso: ${pdfUrl}`);
        
        res.json({ pdfUrl });

    } catch (error) {
        console.error('[ERRO] Falha:', error);
        res.status(500).json({ error: 'Falha ao gerar o roteiro' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô do Lucas Janone rodando na porta ${PORT}`);
});