require('dotenv').config();
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// CORS configurado explicitamente para permitir o frontend
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware para garantir headers CORS mesmo em erros
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

const pdfsDir = path.join(__dirname, 'public', 'pdfs');
if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
}
app.use('/pdfs', express.static(pdfsDir));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const formatarNome = (str) => {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// MOTOR DE IMAGEM HÍBRIDO (Garante uma capa de cinema sem quebrar o PDF)
async function getCoverImageBase64(city) {
    const cleanCity = city.split(',')[0].trim();
    let imgUrl = null;
    try {
        let res = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanCity)}`);
        let data = await res.json();
        if (data.originalimage && data.originalimage.source) imgUrl = data.originalimage.source;
        
        if(!imgUrl) {
            res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanCity)}`);
            data = await res.json();
            if (data.originalimage && data.originalimage.source) imgUrl = data.originalimage.source;
        }

        if(!imgUrl) {
            const seed = Math.floor(Math.random()*1000);
            imgUrl = `https://loremflickr.com/1200/800/${encodeURIComponent(cleanCity)},architecture,luxury/all?lock=${seed}`;
        }

        const imgRes = await fetch(imgUrl, { timeout: 10000 });
        const arrayBuffer = await imgRes.arrayBuffer();
        return `data:image/jpeg;base64,${Buffer.from(arrayBuffer).toString('base64')}`;
    } catch (error) {
        console.warn(`[AVISO] Falha geral de imagens. Usando Capa Texturizada Azul/Ouro.`);
        return null;
    }
}

app.post('/api/gerar-roteiro', async (req, res) => {
    try {
        const { nome, dataViagem, dataVolta, numeroViajantes, destino, orcamento, mustHaves } = req.body;
        const nomeCliente = formatarNome(nome);
        const destinoLimpo = destino.trim().split(',')[0]; 
        
        // Calcula número de dias da viagem
        let numDias = 5; // fallback padrão
        if (dataViagem && dataVolta) {
            const d1 = new Date(dataViagem + 'T00:00:00');
            const d2 = new Date(dataVolta + 'T00:00:00');
            const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
            if (diff > 0) numDias = diff;
        }
        
        console.log(`[LOG] Iniciando Pitch Deck V2 para: ${nomeCliente} - Destino: ${destino} - Dias: ${numDias}`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const apiResp = await fetch(url);
        const apiData = await apiResp.json();
        
        let targetModel = "gemini-1.5-flash"; 
        if (apiData.models) {
            const availableModels = apiData.models.filter(m => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'));
            if (availableModels.length > 0) targetModel = availableModels.find(m => m.name.includes('flash'))?.name.replace('models/', '') || availableModels[0].name.replace('models/', '');
        }

        const prompt = `Você é Lucas Janone, curador de viagens de alto luxo.
        Crie um roteiro premium de EXATAMENTE ${numDias} DIAS para ${nomeCliente} viajando para ${destino} (${numeroViajantes} pessoas, R$ ${orcamento}, Exigências: ${mustHaves}).
        REGRA OBRIGATÓRIA: O array "dias" DEVE conter exatamente ${numDias} objetos, um para cada dia da viagem. Não encurte, não resuma, não agrupe dias.
        RETORNE EXCLUSIVAMENTE UM OBJETO JSON VÁLIDO.
        REGRA VITAL: Seja CONCISO, POÉTICO e ELEGANTE. Não use palavras em CAIXA ALTA (exceto siglas necessárias).
        
        Estrutura exata:
        {
          "boasVindas": "Sua carta inicial (máximo 3 frases curtas e impactantes).",
          "citacao": {
            "frase": "Frase luxuosa sobre viagens (curta)",
            "autor": "Nome do Autor"
          },
          "estrategia": [
            "Ponto 1 da estratégia de investimento (curto)",
            "Ponto 2 da estratégia de investimento (curto)"
          ],
          "dias": [
            {
              "dia": 1,
              "titulo": "Título sofisticado do dia",
              "manha": "Atividade premium (1 frase elaborada)",
              "tarde": "Atividade premium (1 frase elaborada)",
              "noite": "Atividade premium (1 frase elaborada)"
            }
          ],
          "segredos": [
            "Segredo local 1 (curto)",
            "Segredo local 2 (curto)"
          ],
          "dicaOuro": "Sua dica de ouro (2 frases máximas)",
          "convite": "Seu convite final elegante (2 frases máximas)"
        }`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        
        let jsonStr = result.response.text();
        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        const dados = JSON.parse(jsonStr);

        console.log(`[LOG] Textos blindados extraídos (${dados.dias.length} dias). Gerando Design Editorial...`);

        const coverBase64 = await getCoverImageBase64(destinoLimpo);
        const coverStyle = coverBase64 
            ? `background-image: linear-gradient(rgba(10, 17, 40, 0.65), rgba(10, 17, 40, 0.95)), url('${coverBase64}');` 
            : `background: linear-gradient(135deg, var(--navy) 0%, #162242 100%);`;

        let roteiroHTML = `
            <div class="page">
                <div class="left-panel">
                    <div class="panel-tag">PRELÚDIO</div>
                    <h2>Boas-Vindas</h2>
                </div>
                <div class="right-panel">
                    <p class="welcome-text">${dados.boasVindas}</p>
                    <blockquote class="quote">"${dados.citacao.frase}"<br><strong>— ${dados.citacao.autor}</strong></blockquote>
                </div>
            </div>

            <div class="page">
                <div class="left-panel">
                    <div class="panel-tag">FINANÇAS</div>
                    <h2>Estratégia de Investimento</h2>
                </div>
                <div class="right-panel">
                    <ul class="luxury-list">
                        ${dados.estrategia.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;

        for (let i = 0; i < dados.dias.length; i++) {
            const dia = dados.dias[i];
            const diaFormatado = dia.dia < 10 ? `0${dia.dia}` : dia.dia;
            
            roteiroHTML += `
            <div class="page">
                <div class="left-panel">
                    <div class="huge-number">${diaFormatado}</div>
                    <h2>${dia.titulo}</h2>
                </div>
                <div class="right-panel">
                    <div class="timeline">
                        <div class="timeline-item">
                            <div class="time-label">MANHÃ</div>
                            <div class="time-content">${dia.manha}</div>
                        </div>
                        <div class="timeline-item">
                            <div class="time-label">TARDE</div>
                            <div class="time-content">${dia.tarde}</div>
                        </div>
                        <div class="timeline-item">
                            <div class="time-label">NOITE</div>
                            <div class="time-content">${dia.noite}</div>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }

        roteiroHTML += `
            <div class="page">
                <div class="left-panel">
                    <div class="panel-tag">EXCLUSIVO</div>
                    <h2>A Assinatura de Lucas Janone</h2>
                </div>
                <div class="right-panel" style="justify-content: center;">
                    <div class="secrets-box">
                        <h3 class="section-subtitle">Segredos Locais</h3>
                        <ul class="luxury-list" style="margin-bottom: 25px;">
                            ${dados.segredos.map(s => `<li style="font-size: 13px;">${s}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div class="gold-box">
                        <h3 class="gold-box-title">A Dica de Ouro</h3>
                        <p>${dados.dicaOuro}</p>
                    </div>

                    <div class="final-invite">
                        <p>${dados.convite}</p>
                    </div>
                </div>
            </div>
        `;

        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                :root { 
                    --navy: #070F22; 
                    --gold: #C29B57; 
                    --text: #333333; 
                    --bg: #FDFCFB; 
                }
                
                @page { size: A4 landscape; margin: 0; }
                
                body { 
                    margin: 0; padding: 0; 
                    background-color: var(--bg);
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                    color: var(--text);
                }
                
                .page { 
                    position: relative; width: 100vw; height: 100vh; 
                    page-break-after: always; display: flex; overflow: hidden; 
                    background-color: var(--bg);
                }
                
                .page::after {
                    content: ''; position: absolute; top: 15px; bottom: 15px; left: 15px; right: 15px;
                    border: 1px solid rgba(194, 155, 87, 0.3); pointer-events: none; z-index: 100;
                }
                
                .cover { 
                    position: relative; width: 100vw; height: 100vh;
                    background-color: var(--navy); ${coverStyle}
                    background-size: cover; background-position: center;
                    display: flex; flex-direction: column; justify-content: center; align-items: center;
                    color: white; text-align: center; page-break-after: always;
                }
                .cover::after {
                    content: ''; position: absolute; top: 15px; bottom: 15px; left: 15px; right: 15px;
                    border: 1px solid rgba(255, 255, 255, 0.2); pointer-events: none; z-index: 10;
                }

                .cover-sub { font-size: 13px; color: var(--gold); letter-spacing: 8px; text-transform: uppercase; font-weight: bold; margin-bottom: 25px; z-index: 20;}
                .cover-title { font-family: 'Didot', 'Palatino Linotype', 'Book Antiqua', Palatino, serif; font-size: 64px; margin: 0 0 35px 0; font-weight: normal; z-index: 20;}
                
                .cover-client { font-size: 12px; letter-spacing: 3px; color: #DDDDDD; text-transform: uppercase; border-top: 1px solid rgba(194, 155, 87, 0.5); border-bottom: 1px solid rgba(194, 155, 87, 0.5); padding: 25px; width: 450px; z-index: 20;}
                .cover-client strong { display: block; font-family: 'Didot', 'Palatino Linotype', Palatino, serif; font-size: 28px; color: white; margin-top: 8px; font-weight: normal; letter-spacing: 1px;}
                
                .cover-logo { position: absolute; bottom: 45px; font-size: 10px; color: rgba(194, 155, 87, 0.8); letter-spacing: 5px; text-transform: uppercase; z-index: 20;}

                .left-panel { 
                    flex: 0 0 35%; background-color: var(--navy); color: var(--gold); 
                    display: flex; flex-direction: column; justify-content: center; 
                    padding: 80px; box-sizing: border-box; z-index: 10;
                }
                .left-panel h2 { 
                    font-family: 'Didot', 'Palatino Linotype', 'Book Antiqua', Palatino, serif; 
                    font-size: 40px; margin: 0; line-height: 1.2; color: white; font-weight: normal;
                }
                .panel-tag { font-size: 11px; letter-spacing: 5px; color: var(--gold); margin-bottom: 20px; text-transform: uppercase; }
                .huge-number { font-family: 'Didot', 'Palatino Linotype', Palatino, serif; font-size: 100px; line-height: 1; color: var(--gold); opacity: 0.9; margin-bottom: 15px;}

                .right-panel { 
                    flex: 1; padding: 80px 100px; 
                    display: flex; flex-direction: column; justify-content: center; box-sizing: border-box; z-index: 10;
                }

                p { font-size: 15px; line-height: 1.8; font-weight: 300; margin-bottom: 20px; color: #4A4A4A;}
                .welcome-text { font-size: 17px; line-height: 2; color: #333;}
                
                .quote { font-family: 'Didot', 'Palatino Linotype', Palatino, serif; font-style: italic; font-size: 24px; color: var(--navy); border-left: 2px solid var(--gold); padding-left: 30px; margin: 40px 0; }
                .quote strong { font-family: 'Helvetica Neue', sans-serif; font-size: 10px; color: #999; font-style: normal; letter-spacing: 3px; text-transform: uppercase; display: block; margin-top: 15px;}

                .luxury-list { list-style: none; padding: 0; margin: 0; }
                .luxury-list li { position: relative; padding-left: 25px; margin-bottom: 20px; font-size: 14px; line-height: 1.7; font-weight: 300; color: #4A4A4A;}
                .luxury-list li::before { content: '◆'; position: absolute; left: 0; top: 2px; color: var(--gold); font-size: 10px; }

                .timeline { border-left: 1px solid rgba(194, 155, 87, 0.4); padding-left: 40px; margin-left: 10px; }
                .timeline-item { position: relative; margin-bottom: 45px; }
                .timeline-item::before { 
                    content: ''; position: absolute; left: -44.5px; top: 3px; 
                    width: 8px; height: 8px; background: var(--bg); border: 2px solid var(--gold); border-radius: 50%; 
                }
                .time-label { font-family: 'Didot', 'Palatino Linotype', serif; font-size: 13px; color: var(--gold); letter-spacing: 4px; margin-bottom: 8px; font-weight: bold;}
                .time-content { font-size: 15px; font-weight: 300; line-height: 1.7; color: #4A4A4A; margin: 0; }

                .section-subtitle { font-family: 'Didot', 'Palatino Linotype', serif; font-size: 22px; color: var(--navy); margin: 0 0 20px 0; font-weight: normal; border-bottom: 1px solid rgba(194, 155, 87, 0.3); padding-bottom: 10px; display: inline-block;}
                
                .gold-box { background-color: #FFFFFF; border-left: 4px solid var(--gold); padding: 35px 40px; margin-top: 10px; box-shadow: 0 10px 40px rgba(0,0,0,0.03); }
                .gold-box-title { font-family: 'Helvetica Neue', sans-serif; font-size: 12px; color: var(--gold); margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 3px; font-weight: bold;}
                .gold-box p { margin: 0; font-size: 15px; color: #333; line-height: 1.8;}

                .final-invite { text-align: center; margin-top: 40px; padding-top: 30px; border-top: 1px solid #EBEBEB;}
                .final-invite p { font-family: 'Didot', 'Palatino Linotype', serif; font-size: 18px; color: var(--navy); margin: 0; font-style: italic;}
            </style>
        </head>
        <body>
            <div class="cover">
                <div class="cover-sub">Dossier de Viagem Privado</div>
                <h1 class="cover-title">A Essência de<br>${destinoLimpo}</h1>
                <div class="cover-client">
                    Curadoria Exclusiva Para<br><strong>${nomeCliente}</strong>
                </div>
                <div class="cover-logo">Lucas Janone • Mentoria Premium</div>
            </div>
            
            ${roteiroHTML}
            
        </body>
        </html>`;

        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-gpu', '--no-zygote', '--disable-dev-shm-usage'] 
        });
        const page = await browser.newPage();
        
        await page.setContent(htmlTemplate, { waitUntil: 'load', timeout: 0 });
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ 
            path: filePath, 
            format: 'A4', 
            landscape: true, 
            printBackground: true 
        });
        await browser.close();

        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        console.log(`[LOG] SUCESSO! Pitch Deck V2 gerado: ${pdfUrl}`);
        res.json({ pdfUrl });

    } catch (error) {
        console.error('[ERRO FATAL]', error);
        res.status(500).json({ error: 'Falha ao gerar o roteiro' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô Pitch Deck V2 rodando na porta ${PORT}`);
});