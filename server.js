require('dotenv').config();
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

app.use(express.json());

const pdfsDir = path.join(__dirname, 'public', 'pdfs');
if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });
app.use('/pdfs', express.static(pdfsDir));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const formatarNome = (str) => {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const formatarDestino = (str) => {
    if (!str) return "";
    const excecoes = ['e', 'de', 'da', 'do', 'das', 'dos'];
    return str.toLowerCase().split(/([\s,]+)/).map(word => {
        if (word.trim() === '' || word === ',' || excecoes.includes(word.trim())) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join('');
};

async function getWikiImage(query, cityFallback, index) {
    let imgUrl = null;
    
    if (query) {
        try {
            let res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
            let data = await res.json();
            if (data.thumbnail && data.thumbnail.source) {
                imgUrl = data.thumbnail.source.replace(/\/\d+px-/, '/800px-'); 
            }
        } catch (e) {}
    }
    
    if (!imgUrl && cityFallback) {
        try {
            let res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cityFallback)}`);
            let data = await res.json();
            if (data.thumbnail && data.thumbnail.source) {
                imgUrl = data.thumbnail.source.replace(/\/\d+px-/, '/800px-');
            }
        } catch (e) {}
    }
    
    if (!imgUrl) {
        const safeWord = encodeURIComponent((cityFallback || 'luxury').split(' ')[0].replace(/[^a-zA-Z0-9]/g, ''));
        imgUrl = `https://loremflickr.com/600/900/${safeWord},landmark/all?lock=${index}`;
    }
    return imgUrl;
}

app.post('/api/gerar-roteiro', async (req, res) => {
    let browser = null; 

    try {
        const body = req.body;
        const nomeCliente = formatarNome(body.nome);
        const destinoFormatado = formatarDestino(body.destino);
        const primeiraCidadeDaLista = (body.destino || "").split(/,| e | - |\//)[0].trim(); 
        
        let numDias = 5; 
        
        if (body.quantidadeDias && !isNaN(parseInt(body.quantidadeDias))) {
            numDias = parseInt(body.quantidadeDias);
        } else if (body.dataViagem && body.dataVolta) {
            const d1 = new Date(body.dataViagem);
            const d2 = new Date(body.dataVolta);
            if (!isNaN(d1) && !isNaN(d2)) {
                const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                if (diff > 0) numDias = diff + 1; 
            }
        }
        
        if (numDias > 20) numDias = 20; 

        // O SCANNER CAMALEÃO (Nunca mais dá Erro 404)
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const apiResp = await fetch(url);
        const apiData = await apiResp.json();
        
        let targetModel = "gemini-2.5-flash"; // Novo Padrão
        
        if (apiData.models) {
            const validModels = apiData.models.filter(m => m.supportedGenerationMethods?.includes('generateContent'));
            const modelNames = validModels.map(m => m.name.replace('models/', ''));
            
            // Lógica de Cascata: Pega o melhor que o Google oferecer hoje
            if (modelNames.includes('gemini-2.5-flash')) {
                targetModel = 'gemini-2.5-flash';
            } else if (modelNames.includes('gemini-flash-latest')) {
                targetModel = 'gemini-flash-latest';
            } else if (modelNames.includes('gemini-pro-latest')) {
                targetModel = 'gemini-pro-latest';
            } else if (modelNames.includes('gemini-2.0-flash')) {
                targetModel = 'gemini-2.0-flash';
            } else if (modelNames.length > 0) {
                targetModel = modelNames[0]; // Se o mundo acabar, pega o primeiro que funcionar!
            }
        }

        console.log(`[LOG] Roteiro V22 (Camaleão): ${nomeCliente} | Destino: ${destinoFormatado} | Dias: ${numDias} | IA: ${targetModel}`);

        const regraTamanho = numDias > 10 
            ? "Escreva NO MÁXIMO 10 PALAVRAS por turno (manha, tarde, noite) para não estourar a memória."
            : "Escreva de forma poética, mas LIMITADO a 2 frases por turno.";

        const prompt = `Você é Lucas Janone, curador de viagens de alto luxo.
        Crie um roteiro premium de EXATAMENTE ${numDias} DIAS para o cliente ${nomeCliente}. Destino(s): ${destinoFormatado}.
        
        ${regraTamanho}
        
        REGRAS DE CÓDIGO (CRÍTICO):
        1. NUNCA use aspas duplas (") dentro dos textos.
        2. Retorne EXCLUSIVAMENTE o objeto JSON.
        3. Para cada dia, forneça a "cidade" exata onde o cliente está, e um "pontoTuristicoIngles" (Nome de um marco visual famoso dessa cidade EM INGLÊS, ex: Eiffel Tower, Pyramids of Giza).

        Estrutura OBRIGATÓRIA:
        {
          "boasVindas": "Bem-vindo a jornada.",
          "citacao": { "frase": "Citação clássica.", "autor": "Autor" },
          "estrategia": [ "Logística impecável.", "Conforto supremo." ],
          "dias": [
            {
              "dia": 1,
              "titulo": "Nome da Cidade: Título",
              "cidade": "Nome da Cidade Atual",
              "pontoTuristicoIngles": "Nome de um monumento famoso dessa cidade em Inglês",
              "manha": "Atividade.",
              "tarde": "Atividade.",
              "noite": "Atividade."
            }
          ],
          "segredos": [ "Segredo 1.", "Segredo 2." ],
          "dicaOuro": "Dica especial.",
          "convite": "Convite final."
        }`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 }
        });
        
        let jsonStr = result.response.text();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        
        let dados;
        try {
            dados = JSON.parse(jsonStr);
        } catch (parseError) {
            console.warn("[AVISO] Ativando Fator de Cura (Wolverine)...");
            try {
                const lastBrace = jsonStr.lastIndexOf('}');
                let fixedStr = jsonStr.substring(0, lastBrace + 1);
                fixedStr += '], "segredos": ["Descubra a cidade através dos olhos dos locais."], "dicaOuro": "Viva o momento.", "convite": "Aguardamos você."}';
                dados = JSON.parse(fixedStr);
            } catch (e2) {
                return res.status(500).json({ error: 'Falha na IA.' });
            }
        }

        console.log(`[LOG] Roteiro extraído. Coletando imagens geográficas exatas...`);

        const coverImage = await getWikiImage(primeiraCidadeDaLista, primeiraCidadeDaLista, 999);
        const strategyImage = `https://loremflickr.com/600/900/luxury,hotel/all?lock=${Math.floor(Math.random()*1000)}`;
        const endImage = `https://loremflickr.com/600/900/sunset,travel/all?lock=${Math.floor(Math.random()*1000)}`;

        const dayImagesUrls = await Promise.all(dados.dias.map((dia, index) => {
            return getWikiImage(dia.pontoTuristicoIngles, dia.cidade, index);
        }));

        let roteiroHTML = `
            <div class="page">
                <div class="left-image-panel">
                    <img src="${coverImage}" alt="Capa">
                </div>
                <div class="right-text-panel">
                    <div class="panel-tag">O PRELÚDIO</div>
                    <h2>Boas-Vindas</h2>
                    <p class="welcome-text">${dados.boasVindas}</p>
                    <blockquote class="quote">"${dados.citacao.frase}"<br><strong>— ${dados.citacao.autor}</strong></blockquote>
                </div>
            </div>

            <div class="page">
                <div class="left-image-panel">
                    <img src="${strategyImage}" alt="Estratégia">
                </div>
                <div class="right-text-panel">
                    <div class="panel-tag">LOGÍSTICA & CONFORTO</div>
                    <h2>Estratégia de Investimento</h2>
                    <ul class="luxury-list">
                        ${dados.estrategia.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;

        for (let i = 0; i < dados.dias.length; i++) {
            const dia = dados.dias[i];
            const diaFormatado = dia.dia < 10 ? `0${dia.dia}` : dia.dia;
            const dayImageUrl = dayImagesUrls[i];

            roteiroHTML += `
            <div class="page">
                <div class="left-image-panel">
                    <img src="${dayImageUrl}" alt="Dia ${dia.dia}">
                    <div class="day-overlay-number">${diaFormatado}</div>
                </div>
                <div class="right-text-panel">
                    <h2 class="day-title">${dia.titulo}</h2>
                    <div class="timeline">
                        <div class="timeline-item">
                            <div class="time-label">MANHÃ</div>
                            <p class="time-content">${dia.manha}</p>
                        </div>
                        <div class="timeline-item">
                            <div class="time-label">TARDE</div>
                            <p class="time-content">${dia.tarde}</p>
                        </div>
                        <div class="timeline-item">
                            <div class="time-label">NOITE</div>
                            <p class="time-content">${dia.noite}</p>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }

        roteiroHTML += `
            <div class="page">
                <div class="left-image-panel">
                    <img src="${endImage}" alt="Despedida">
                </div>
                <div class="right-text-panel" style="justify-content: center;">
                    <div class="panel-tag">ACESSO EXCLUSIVO</div>
                    <h2 style="margin-bottom: 30px;">A Assinatura de Lucas Janone</h2>
                    
                    <div class="secrets-box">
                        <h3 class="section-subtitle">Segredos Locais</h3>
                        <ul class="luxury-list" style="margin-bottom: 25px;">
                            ${dados.segredos.map(s => `<li>${s}</li>`).join('')}
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
                :root { --navy: #0A1128; --gold: #C29B57; --text: #2A2A2A; --bg: #FFFFFF; }
                @page { size: A4 landscape; margin: 0; }
                body { margin: 0; padding: 0; background-color: var(--bg); font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--text); }
                
                .page { position: relative; width: 100vw; height: 100vh; page-break-after: always; display: flex; overflow: hidden; background-color: var(--bg); }
                
                .cover { position: relative; width: 100vw; height: 100vh; background-color: var(--navy); display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; text-align: center; page-break-after: always; }
                .cover-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.45; z-index: 1;}
                .cover-content { position: relative; z-index: 20; display: flex; flex-direction: column; align-items: center;}
                
                .cover-sub { font-size: 13px; color: var(--gold); letter-spacing: 8px; text-transform: uppercase; font-weight: bold; margin-bottom: 25px;}
                .cover-title { font-family: 'Didot', 'Palatino Linotype', serif; font-size: 58px; margin: 0 0 30px 0; font-weight: normal; line-height: 1.2; padding: 0 40px;}
                .cover-client { font-size: 12px; letter-spacing: 3px; color: #DDDDDD; text-transform: uppercase; border-top: 1px solid rgba(194, 155, 87, 0.5); border-bottom: 1px solid rgba(194, 155, 87, 0.5); padding: 25px; width: 500px;}
                .cover-client strong { display: block; font-family: 'Didot', 'Palatino Linotype', serif; font-size: 32px; color: white; margin-top: 8px; font-weight: normal; letter-spacing: 1px;}
                .cover-logo { position: absolute; bottom: 45px; font-size: 10px; color: rgba(194, 155, 87, 0.8); letter-spacing: 5px; text-transform: uppercase; z-index: 20;}

                .left-image-panel { flex: 0 0 42%; position: relative; background: linear-gradient(135deg, var(--navy) 0%, #162242 100%); overflow: hidden; }
                .left-image-panel img { width: 100%; height: 100%; object-fit: cover; opacity: 0.9; color: transparent; }
                .day-overlay-number { position: absolute; bottom: 40px; right: 40px; font-family: 'Didot', serif; font-size: 130px; line-height: 0.8; color: white; opacity: 0.95; text-shadow: 2px 2px 20px rgba(0,0,0,0.5); }

                .right-text-panel { flex: 1; padding: 60px 80px; display: flex; flex-direction: column; justify-content: center; box-sizing: border-box; background-color: #FAFAFA; }
                
                .right-text-panel h2 { font-family: 'Didot', 'Palatino Linotype', serif; font-size: 38px; margin: 0 0 20px 0; line-height: 1.2; color: var(--navy); font-weight: normal; }
                .day-title { font-size: 32px !important; margin-bottom: 35px !important; border-bottom: 2px solid var(--gold); padding-bottom: 15px; display: inline-block;}
                
                .panel-tag { font-size: 11px; letter-spacing: 5px; color: var(--gold); margin-bottom: 15px; text-transform: uppercase; font-weight: bold;}

                p { font-size: 14.5px; line-height: 1.9; font-weight: 300; margin-bottom: 20px; color: #444; text-align: justify;}
                .welcome-text { font-size: 15.5px; line-height: 2; color: #333;}
                
                .quote { font-family: 'Didot', serif; font-style: italic; font-size: 22px; color: var(--navy); border-left: 2px solid var(--gold); padding-left: 25px; margin: 30px 0; }
                .quote strong { font-family: 'Helvetica Neue', sans-serif; font-size: 10px; color: #999; font-style: normal; letter-spacing: 3px; text-transform: uppercase; display: block; margin-top: 10px;}

                .luxury-list { list-style: none; padding: 0; margin: 0; }
                .luxury-list li { position: relative; padding-left: 25px; margin-bottom: 15px; font-size: 14.5px; line-height: 1.8; font-weight: 300; color: #444; text-align: justify;}
                .luxury-list li::before { content: '◆'; position: absolute; left: 0; top: 2px; color: var(--gold); font-size: 10px; }

                .timeline { border-left: 1px solid rgba(194, 155, 87, 0.4); padding-left: 30px; margin-left: 5px; }
                .timeline-item { position: relative; margin-bottom: 30px; }
                .timeline-item::before { content: ''; position: absolute; left: -34px; top: 5px; width: 6px; height: 6px; background: var(--bg); border: 2px solid var(--gold); border-radius: 50%; }
                .time-label { font-family: 'Didot', serif; font-size: 14px; color: var(--gold); letter-spacing: 3px; margin-bottom: 5px; font-weight: bold;}
                .time-content { font-size: 14px; font-weight: 300; line-height: 1.8; color: #444; margin: 0; text-align: justify; }

                .section-subtitle { font-family: 'Didot', serif; font-size: 20px; color: var(--navy); margin: 0 0 15px 0; font-weight: normal; }
                .gold-box { background-color: #FFFFFF; border-left: 4px solid var(--gold); padding: 25px 30px; margin-top: 10px; box-shadow: 0 5px 30px rgba(0,0,0,0.03); }
                .gold-box-title { font-family: 'Helvetica Neue', sans-serif; font-size: 11px; color: var(--gold); margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 3px; font-weight: bold;}
                .gold-box p { margin: 0; font-size: 14.5px; color: #333; line-height: 1.8; text-align: justify;}

                .final-invite { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #EBEBEB;}
                .final-invite p { font-family: 'Didot', serif; font-size: 16px; color: var(--navy); margin: 0; font-style: italic; text-align: center;}
            </style>
        </head>
        <body>
            <div class="cover">
                <img class="cover-bg" src="${coverImage}" alt="Capa Background">
                <div class="cover-content">
                    <div class="cover-sub">Dossier de Viagem Privado</div>
                    <h1 class="cover-title">A Essência de<br>${destinoFormatado}</h1>
                    <div class="cover-client">
                        Curadoria Exclusiva Para<br><strong>${nomeCliente}</strong>
                    </div>
                </div>
                <div class="cover-logo">Lucas Janone • Mentoria Premium</div>
            </div>
            ${roteiroHTML}
        </body>
        </html>`;

        browser = await puppeteer.launch({ 
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu', 
                '--no-zygote',
                '--single-process'
            ] 
        });
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setJavaScriptEnabled(false);
        
        await page.setContent(htmlTemplate, { waitUntil: 'domcontentloaded', timeout: 0 });
        
        await page.evaluate(async () => {
            await new Promise(resolve => {
                const images = Array.from(document.images);
                if (images.length === 0) return resolve();
                let loaded = 0;
                let timeout = setTimeout(() => resolve(), 15000); // 15 segundos para as fotos da Wiki carregarem, e imprime!
                images.forEach(img => {
                    if (img.complete) {
                        loaded++;
                        if (loaded === images.length) { clearTimeout(timeout); resolve(); }
                    } else {
                        img.addEventListener('load', () => { loaded++; if (loaded === images.length) { clearTimeout(timeout); resolve(); } });
                        img.addEventListener('error', () => { loaded++; if (loaded === images.length) { clearTimeout(timeout); resolve(); } });
                    }
                });
            });
        });
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ path: filePath, format: 'A4', landscape: true, printBackground: true });
        
        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        console.log(`[LOG] SUCESSO ABSOLUTO V22! PDF com imagens reais gerado: ${pdfUrl}`);
        res.json({ pdfUrl });

    } catch (error) {
        console.error('[ERRO CRÍTICO]', error);
        res.status(500).json({ error: 'Falha crítica ao gerar o roteiro' });
    } finally {
        if (browser !== null) {
            await browser.close().catch(e => console.error('Erro ao fechar:', e));
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô V22 (Camaleão & Wikipedia) rodando na porta ${PORT}`);
});