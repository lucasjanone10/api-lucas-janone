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

const formatarNome = (str) => {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// MOTOR DE IMAGEM 100% REAL (VIA WIKIPEDIA) - Zero Marcas d'água, Zero Gatos.
async function getRealDestinationImage(city) {
    const cleanCity = city.split(',')[0].trim();
    try {
        // Tenta buscar na Wikipedia em Português
        let res = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanCity)}`);
        let data = await res.json();
        if (data.originalimage && data.originalimage.source) return data.originalimage.source;
        
        // Tenta buscar na Wikipedia em Inglês se falhar
        res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanCity)}`);
        data = await res.json();
        if (data.originalimage && data.originalimage.source) return data.originalimage.source;
        
        return null;
    } catch (error) {
        console.warn(`[AVISO] Wikipedia não encontrou foto para ${cleanCity}. Usando Capa Tipográfica.`);
        return null;
    }
}

app.post('/api/gerar-roteiro', async (req, res) => {
    try {
        const { nome, dataViagem, numeroViajantes, destino, orcamento, mustHaves } = req.body;
        const nomeCliente = formatarNome(nome);
        const destinoLimpo = destino.trim().split(',')[0]; 
        
        console.log(`[LOG] Iniciando Pitch Deck de Luxo para: ${nomeCliente} - Destino: ${destino}`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const apiResp = await fetch(url);
        const apiData = await apiResp.json();
        
        let targetModel = "gemini-1.5-flash"; 
        if (apiData.models) {
            const availableModels = apiData.models.filter(m => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'));
            if (availableModels.length > 0) targetModel = availableModels.find(m => m.name.includes('flash'))?.name.replace('models/', '') || availableModels[0].name.replace('models/', '');
        }

        // CÉREBRO ESTRUTURADO: A IA devolve JSON puro e curto para caber no novo design de tela.
        const prompt = `Você é Lucas Janone, curador de viagens de alto luxo.
        Crie um roteiro premium para ${nomeCliente} viajando para ${destino} (${numeroViajantes} pessoas, R$ ${orcamento}, Exigências: ${mustHaves}).
        
        RETORNE EXCLUSIVAMENTE UM OBJETO JSON VÁLIDO.
        REGRA VITAL: Seja CONCISO e ELEGANTE. Textos curtos e impactantes. Não use palavras inteiras em maiúsculas.
        
        Estrutura exata:
        {
          "boasVindas": "Sua carta inicial (máximo 3 frases curtas e impactantes).",
          "citacao": {
            "frase": "Frase sobre viagens curtas",
            "autor": "Nome do Autor"
          },
          "estrategia": [
            "Ponto 1 da estratégia (curto)",
            "Ponto 2 da estratégia (curto)"
          ],
          "dias": [
            {
              "dia": 1,
              "titulo": "Título do dia",
              "manha": "Atividade (1 frase)",
              "tarde": "Atividade (1 frase)",
              "noite": "Atividade (1 frase)"
            }
          ],
          "segredos": [
            "Segredo 1 (curto)",
            "Segredo 2 (curto)"
          ],
          "dicaOuro": "Sua dica de ouro (2 frases máximas)",
          "convite": "Seu convite final (2 frases máximas)"
        }`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        
        const jsonStr = result.response.text();
        const dados = JSON.parse(jsonStr);

        console.log(`[LOG] Textos gerados. Montando o Design Paisagem (Landscape)...`);

        // Busca a imagem real da cidade na Wikipedia
        const coverImageUrl = await getRealDestinationImage(destinoLimpo);
        
        // Se a Wikipedia achar a foto, criamos uma capa com foto. Se não, uma capa tipográfica chique em Azul/Dourado.
        const coverStyle = coverImageUrl 
            ? `background-image: linear-gradient(rgba(10, 17, 40, 0.7), rgba(10, 17, 40, 0.95)), url('${coverImageUrl}');` 
            : `background: linear-gradient(135deg, var(--navy) 0%, #1a2a5c 100%);`;

        // CONSTRUÇÃO DO HTML (Layout Horizontal de Apresentação)
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

        // PÁGINAS DOS DIAS
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
                    <div class="timeline-item">
                        <h3>M A N H Ã</h3>
                        <p>${dia.manha}</p>
                    </div>
                    <div class="timeline-item">
                        <h3>T A R D E</h3>
                        <p>${dia.tarde}</p>
                    </div>
                    <div class="timeline-item">
                        <h3>N O I T E</h3>
                        <p>${dia.noite}</p>
                    </div>
                </div>
            </div>
            `;
        }

        // PÁGINA FINAL (Segredos, Dica e Despedida)
        roteiroHTML += `
            <div class="page">
                <div class="left-panel">
                    <div class="panel-tag">EXCLUSIVO</div>
                    <h2>A Assinatura de Lucas Janone</h2>
                </div>
                <div class="right-panel" style="justify-content: center;">
                    <div class="secrets-box">
                        <h3>Segredos Locais</h3>
                        <ul class="luxury-list" style="margin-bottom: 30px;">
                            ${dados.segredos.map(s => `<li style="font-size: 13px;">${s}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div class="gold-box">
                        <h3>A Dica de Ouro</h3>
                        <p>${dados.dicaOuro}</p>
                    </div>

                    <p class="final-invite">${dados.convite}</p>
                </div>
            </div>
        `;

        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                /* O SEGREDO DO LUXO: Fontes de sistema que NUNCA falham na nuvem */
                :root { 
                    --navy: #0A1128; 
                    --gold: #C5A059; 
                    --text: #2C3E50; 
                    --bg: #F8F9FA; 
                }
                
                /* Define a página como PAISAGEM (Deitada) */
                @page { size: A4 landscape; margin: 0; }
                
                body { 
                    margin: 0; padding: 0; 
                    background-color: var(--bg);
                    /* Fonte principal: Elegante, limpa, nativa */
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                    color: var(--text);
                }
                
                /* Estrutura de cada "Slide" */
                .page { 
                    width: 100vw; height: 100vh; 
                    page-break-after: always; 
                    display: flex; 
                    overflow: hidden; 
                }
                
                /* CAPA HERÓICA */
                .cover { 
                    width: 100vw; height: 100vh;
                    background-color: var(--navy);
                    ${coverStyle}
                    background-size: cover; background-position: center;
                    display: flex; flex-direction: column; justify-content: center; align-items: center;
                    color: white; text-align: center; page-break-after: always;
                }
                .cover-sub { font-size: 14px; color: var(--gold); letter-spacing: 6px; text-transform: uppercase; font-weight: bold; margin-bottom: 20px;}
                .cover-title { font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif; font-size: 60px; margin: 0 0 30px 0; font-weight: normal; }
                .cover-client { font-size: 14px; letter-spacing: 2px; color: #CCC; text-transform: uppercase; border-top: 1px solid var(--gold); border-bottom: 1px solid var(--gold); padding: 20px; width: 400px;}
                .cover-client strong { display: block; font-family: 'Palatino Linotype', Palatino, serif; font-size: 26px; color: white; margin-top: 5px; font-weight: normal; letter-spacing: 1px;}
                .cover-logo { position: absolute; bottom: 40px; font-size: 10px; color: var(--gold); letter-spacing: 4px; text-transform: uppercase; }

                /* PAINEIS INTERNOS (Layout 2 Colunas) */
                .left-panel { 
                    flex: 0 0 35%; 
                    background-color: var(--navy); 
                    color: var(--gold); 
                    display: flex; flex-direction: column; justify-content: center; 
                    padding: 60px; box-sizing: border-box;
                    border-right: 2px solid var(--gold);
                }
                .left-panel h2 { 
                    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif; 
                    font-size: 38px; margin: 0; line-height: 1.2; color: white; font-weight: normal;
                }
                .panel-tag { font-size: 11px; letter-spacing: 4px; color: var(--gold); margin-bottom: 15px; }
                .huge-number { font-family: 'Palatino Linotype', Palatino, serif; font-size: 90px; line-height: 1; color: var(--gold); opacity: 0.8; margin-bottom: 10px;}

                .right-panel { 
                    flex: 1; 
                    padding: 80px 100px; 
                    display: flex; flex-direction: column; justify-content: center;
                    box-sizing: border-box;
                }

                /* TIPOGRAFIA INTERNA */
                p { font-size: 15px; line-height: 1.8; font-weight: 300; margin-bottom: 20px;}
                .welcome-text { font-size: 18px; line-height: 1.9; }
                
                .quote { font-family: 'Palatino Linotype', Palatino, serif; font-style: italic; font-size: 22px; color: var(--navy); border-left: 3px solid var(--gold); padding-left: 25px; margin: 40px 0; }
                .quote strong { font-family: 'Helvetica Neue', sans-serif; font-size: 11px; color: #888; font-style: normal; letter-spacing: 2px; text-transform: uppercase; display: block; margin-top: 15px;}

                .luxury-list { list-style: none; padding: 0; margin: 0; }
                .luxury-list li { position: relative; padding-left: 20px; margin-bottom: 25px; font-size: 15px; line-height: 1.7; font-weight: 300; }
                .luxury-list li::before { content: '■'; position: absolute; left: 0; top: 0; color: var(--gold); font-size: 9px; }

                .timeline-item { margin-bottom: 35px; }
                .timeline-item h3 { font-family: 'Palatino Linotype', Palatino, serif; font-size: 14px; color: var(--gold); margin: 0 0 10px 0; font-weight: bold; border-bottom: 1px solid #EEE; padding-bottom: 5px; }
                .timeline-item p { margin: 0; font-size: 14px; }

                .gold-box { background-color: #FDF9F1; border: 1px solid var(--gold); padding: 30px; margin-bottom: 30px; }
                .gold-box h3 { font-family: 'Palatino Linotype', Palatino, serif; font-size: 18px; color: var(--navy); margin: 0 0 10px 0; }
                .gold-box p { margin: 0; font-size: 14px; color: #444; }

                .final-invite { text-align: center; font-family: 'Palatino Linotype', Palatino, serif; font-size: 18px; color: var(--navy); border-top: 1px solid #EEE; padding-top: 20px; margin-top: 20px;}
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
        
        // A velocidade disso será insana, pois não há imagens externas bloqueando a página (só a da capa via Wiki)
        await page.setContent(htmlTemplate, { waitUntil: 'load', timeout: 0 });
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        // IMPRESSÃO EM PAISAGEM (Landscape)
        await page.pdf({ 
            path: filePath, 
            format: 'A4', 
            landscape: true, 
            printBackground: true 
        });
        await browser.close();

        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        console.log(`[LOG] SUCESSO! Pitch Deck Paisagem gerado: ${pdfUrl}`);
        res.json({ pdfUrl });

    } catch (error) {
        console.error('[ERRO FATAL]', error);
        res.status(500).json({ error: 'Falha ao gerar o roteiro' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô Pitch Deck rodando na porta ${PORT}`);
});