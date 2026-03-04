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
const delay = ms => new Promise(res => setTimeout(res, ms));

const formatarNome = (str) => {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// MOTOR DE IMAGENS BLINDADO
async function getBase64Image(prompt, fallbackCity, width, height) {
    try {
        const seed = Math.floor(Math.random() * 999999);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
        
        const response = await fetch(url, { 
            timeout: 12000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (!response.ok) throw new Error('Bloqueio AI');
        const arrayBuffer = await response.arrayBuffer();
        return `data:image/jpeg;base64,${Buffer.from(arrayBuffer).toString('base64')}`;
    } catch (error) {
        console.warn(`[AVISO] IA de imagem falhou. Acionando banco de fotos reais para: ${fallbackCity}`);
        try {
            // PLANO B: Puxa uma foto turística real e impecável do destino
            const seed = Math.floor(Math.random() * 1000);
            const fallbackUrl = `https://loremflickr.com/${width}/${height}/${encodeURIComponent(fallbackCity)},travel,luxury/all?lock=${seed}`;
            const res = await fetch(fallbackUrl, { timeout: 8000 });
            const arr = await res.arrayBuffer();
            return `data:image/jpeg;base64,${Buffer.from(arr).toString('base64')}`;
        } catch (fatalError) {
            // PLANO C: Pixel em branco para o PDF não dar erro
            return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        }
    }
}

app.post('/api/gerar-roteiro', async (req, res) => {
    try {
        const { nome, dataViagem, numeroViajantes, destino, orcamento, mustHaves } = req.body;
        const nomeCliente = formatarNome(nome);
        const destinoLimpo = destino.trim().split(',')[0]; // Ex: Pega só "Angra dos Reis"
        
        console.log(`[LOG] Iniciando Roteiro Matriz para: ${nomeCliente} - Destino: ${destino}`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const apiResp = await fetch(url);
        const apiData = await apiResp.json();
        
        let targetModel = "gemini-1.5-flash"; 
        if (apiData.models) {
            const availableModels = apiData.models.filter(m => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'));
            if (availableModels.length > 0) targetModel = availableModels.find(m => m.name.includes('flash'))?.name.replace('models/', '') || availableModels[0].name.replace('models/', '');
        }

        // NOVO CÉREBRO: A IA agora devolve DADOS (JSON) e não mais HTML. Acabou o caos.
        const prompt = `Você é Lucas Janone, curador de viagens de alto luxo.
        Crie um roteiro premium impecável para ${nomeCliente} viajando para ${destino} (${numeroViajantes} pessoas, R$ ${orcamento}, Exigências: ${mustHaves}).
        
        RETORNE EXCLUSIVAMENTE UM OBJETO JSON VÁLIDO. NÃO ESCREVA MAIS NADA ALÉM DO JSON.
        Regra de Ouro: Escreva como um humano elegante. NUNCA escreva textos inteiros em MAIÚSCULAS.
        
        Use exatamente esta estrutura:
        {
          "boasVindas": "Sua carta inicial elegante...",
          "citacao": {
            "frase": "A frase inspiradora aqui",
            "autor": "Nome do Autor"
          },
          "estrategia": [
            "Tópico 1 da estratégia financeira",
            "Tópico 2 da estratégia..."
          ],
          "dias": [
            {
              "dia": 1,
              "titulo": "Título elegante do dia",
              "manha": "Atividades da manhã...",
              "tarde": "Atividades da tarde...",
              "noite": "Atividades da noite..."
            },
            {
              "dia": 2,
              "titulo": "Título do segundo dia",
              "manha": "...",
              "tarde": "...",
              "noite": "..."
            }
          ],
          "segredos": [
            "Curiosidade 1",
            "Curiosidade 2",
            "Curiosidade 3"
          ],
          "dicaOuro": "A sua dica de ouro especial...",
          "convite": "Seu convite final para a mentoria..."
        }`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        
        // Extrai e garante que os dados estão perfeitos
        const jsonStr = result.response.text();
        const dados = JSON.parse(jsonStr);

        console.log(`[LOG] Dados estruturados recebidos com sucesso! Baixando imagens exclusivas...`);

        // O NOSSO ROBÔ MONTA O HTML PERFEITO, SEM DEIXAR A IA ESTRAGAR
        let roteiroHTML = `
            <div class="day-header" style="margin-top: 0; page-break-before: avoid;">
                <h2>Carta de Boas-Vindas</h2>
            </div>
            <p>${dados.boasVindas}</p>
            <blockquote class="quote">"${dados.citacao.frase}"<br><strong>— ${dados.citacao.autor}</strong></blockquote>
            
            <div class="day-header">
                <h2>Estratégia de Investimento</h2>
            </div>
            <ul>
                ${dados.estrategia.map(item => `<li>${item}</li>`).join('')}
            </ul>
        `;

        // Processa cada dia individualmente, garantindo UMA foto por dia
        for (let i = 0; i < dados.dias.length; i++) {
            const dia = dados.dias[i];
            console.log(`[LOG] Baixando foto para o Dia ${dia.dia}...`);
            const imgPrompt = `cinematic luxury travel photography ${destinoLimpo} stunning famous landmark 4k no text`;
            const base64Img = await getBase64Image(imgPrompt, destinoLimpo, 800, 450);
            
            roteiroHTML += `
            <div class="day-header">
                <h2>Dia ${dia.dia}: ${dia.titulo}</h2>
                <div class="img-container"><img class="day-image" src="${base64Img}" alt="Cenário de ${destinoLimpo}"></div>
            </div>
            <h3>🌅 Manhã</h3><p>${dia.manha}</p>
            <h3>☀️ Tarde</h3><p>${dia.tarde}</p>
            <h3>🌙 Noite</h3><p>${dia.noite}</p>
            `;
            await delay(1500); // Pausa de segurança
        }

        roteiroHTML += `
            <div class="day-header">
                <h2>Segredos Locais</h2>
            </div>
            <ul>
                ${dados.segredos.map(segredo => `<li>${segredo}</li>`).join('')}
            </ul>

            <div class="dica-lucas">
                <strong>💡 A Dica de Ouro de Lucas Janone</strong>
                <p>${dados.dicaOuro}</p>
            </div>

            <div class="day-header">
                <h2>Próximos Passos</h2>
            </div>
            <p>${dados.convite}</p>
        `;

        console.log(`[LOG] Gerando a Capa Premium...`);
        const coverBase64 = await getBase64Image(`beautiful cinematic luxury travel photography ${destinoLimpo} stunning famous landmark masterpiece 4k no text`, destinoLimpo, 900, 1200);

        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
            <style>
                :root { --navy: #0A1128; --gold: #C5A059; --text: #2C3E50; --bg: #FAFAFA; }
                @page { margin: 0; }
                body { font-family: 'Lato', sans-serif; color: var(--text); background-color: var(--bg); margin: 0; padding: 0; line-height: 1.8; }
                
                .cover { 
                    height: 100vh; width: 100vw; max-height: 100vh; overflow: hidden; 
                    background-color: var(--navy); 
                    background-image: linear-gradient(rgba(10, 17, 40, 0.7), rgba(10, 17, 40, 0.95)), url('${coverBase64}');
                    background-size: cover; background-position: center;
                    color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; padding: 40px; box-sizing: border-box; 
                    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
                }
                .cover-subtitle { font-family: 'Lato', sans-serif; color: var(--gold); font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 5px; margin-bottom: 25px; }
                .cover-title { font-family: 'Cinzel', serif; font-size: 48px; font-weight: 700; margin: 0 0 35px 0; line-height: 1.2; text-shadow: 2px 2px 20px rgba(0,0,0,0.8); }
                .cover-client-box { border-top: 1px solid rgba(197, 160, 89, 0.4); border-bottom: 1px solid rgba(197, 160, 89, 0.4); padding: 20px 0; margin-top: 15px; width: 70%; max-width: 500px; }
                .cover-client { font-family: 'Lato', sans-serif; font-size: 14px; font-weight: 300; color: #E0E0E0; text-transform: uppercase; letter-spacing: 2px; }
                .cover-client strong { color: var(--gold); font-weight: 700; font-size: 26px; display: block; margin-top: 5px; font-family: 'Cinzel', serif; letter-spacing: 1px;}
                .cover-logo { margin-top: auto; font-family: 'Lato', sans-serif; font-size: 11px; color: rgba(255,255,255,0.5); letter-spacing: 3px; text-transform: uppercase; padding-bottom: 20px; }

                .content-wrapper { padding: 50px 80px; } 
                .day-header { page-break-before: always; page-break-inside: avoid; margin-top: 40px; }
                
                h2 { font-family: 'Cinzel', serif; color: var(--navy); font-size: 30px; text-align: center; margin: 0; padding-top: 20px; font-weight: 700; }
                h2::after { content: ''; display: block; width: 80px; height: 1px; border-top: 1px solid var(--gold); border-bottom: 1px solid var(--gold); padding-bottom: 2px; margin: 25px auto 0; }
                h3 { font-family: 'Cinzel', serif; color: var(--gold); font-size: 20px; margin-top: 40px; margin-bottom: 15px; border-bottom: 1px solid #EAEAEA; padding-bottom: 10px; font-weight: 700; }
                
                p, li { font-size: 15px; color: var(--text); text-align: justify; margin-bottom: 18px; font-weight: 300; }
                
                .img-container { width: 100%; text-align: center; margin: 35px 0; }
                .day-image { width: 100%; max-height: 400px; object-fit: cover; border-radius: 4px; box-shadow: 0 15px 35px rgba(10, 17, 40, 0.08); }
                
                .quote { font-family: 'Cinzel', serif; font-style: italic; color: var(--navy); text-align: center; margin: 50px 0; font-size: 22px; line-height: 1.4; padding: 40px; background-color: #FFFFFF; border: 1px solid #EAEAEA; box-shadow: 0 10px 30px rgba(0,0,0,0.02); }
                .quote strong { font-family: 'Lato', sans-serif; color: var(--gold); display: block; margin-top: 20px; font-size: 12px; text-transform: uppercase; font-style: normal; letter-spacing: 3px; font-weight: 700; }
                
                .dica-lucas { background-color: #FFFFFF; border: 1px solid var(--gold); padding: 35px 40px; margin: 50px 0; box-shadow: 0 10px 30px rgba(197, 160, 89, 0.05); page-break-inside: avoid; }
                .dica-lucas strong { font-family: 'Cinzel', serif; color: var(--navy); display: block; margin-bottom: 15px; font-size: 20px; font-weight: 700; }
            </style>
        </head>
        <body>
            <div class="cover">
                <div class="cover-subtitle">Plano de Viagem Exclusivo</div>
                <h1 class="cover-title">A Essência de<br>${destinoLimpo}</h1>
                <div class="cover-client-box">
                    <div class="cover-client">Preparado sob medida para<br><strong>${nomeCliente}</strong></div>
                </div>
                <div class="cover-logo">Lucas Janone • Mentoria de Viagens Premium</div>
            </div>
            <div class="content-wrapper">
                ${roteiroHTML}
            </div>
        </body>
        </html>`;

        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-gpu', '--no-zygote', '--disable-dev-shm-usage'] 
        });
        const page = await browser.newPage();
        
        await page.setContent(htmlTemplate, { waitUntil: 'load', timeout: 0 });
        await page.evaluateHandle('document.fonts.ready');
        await new Promise(r => setTimeout(r, 2000));
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ path: filePath, format: 'A4', printBackground: true });
        await browser.close();

        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        console.log(`[LOG] SUCESSO ABSOLUTO! PDF gerado: ${pdfUrl}`);
        res.json({ pdfUrl });

    } catch (error) {
        console.error('[ERRO FATAL]', error);
        res.status(500).json({ error: 'Falha ao gerar o roteiro' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô Matriz rodando na porta ${PORT}`);
});