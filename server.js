/**
 * ============================================================================
 * SISTEMA GERADOR DE ROTEIROS DE ALTO LUXO - VERSÃO 33 (CAPA VOGUE SPLIT)
 * ARQUITETURA: LUCAS JANONE MENTORIA PREMIUM
 * ============================================================================
 */

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

// ============================================================================
// 1. UTILITÁRIOS E CLASSES DE SUPORTE
// ============================================================================

class Logger {
    static info(msg, data = '') { console.log(`[INFO] [${new Date().toISOString()}] ${msg}`, data); }
    static warn(msg, data = '') { console.warn(`[WARN] [${new Date().toISOString()}] ⚠️ ${msg}`, data); }
    static error(msg, error) { console.error(`[ERROR] [${new Date().toISOString()}] ❌ ${msg}`, error); }
}

const formatadores = {
    nome: (str) => {
        if (!str) return "Estimado Cliente";
        return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    },
    destino: (str) => {
        if (!str) return "Destino Exclusivo";
        const excecoes = ['e', 'de', 'da', 'do', 'das', 'dos'];
        return str.toLowerCase().split(/([\s,]+)/).map(word => {
            if (word.trim() === '' || word === ',' || excecoes.includes(word.trim())) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        }).join('');
    },
    extrairDias: (body) => {
        let numDias = 5; 
        try {
            const bodyStr = JSON.stringify(body).toLowerCase();
            const matchDias = bodyStr.match(/(\d+)\s*dias?/);
            const chaveDias = body.quantidadeDias || body.numeroDias || body.dias;
            
            if (chaveDias && !isNaN(parseInt(chaveDias))) numDias = parseInt(chaveDias);
            else if (matchDias && parseInt(matchDias[1]) > 0) numDias = parseInt(matchDias[1]); 
            else if (body.dataViagem && body.dataVolta) {
                const d1 = new Date(body.dataViagem);
                const d2 = new Date(body.dataVolta);
                if (!isNaN(d1) && !isNaN(d2)) {
                    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                    if (diff > 0) numDias = diff + 1; 
                }
            }
        } catch (e) {}
        return numDias > 25 ? 25 : (numDias < 1 ? 5 : numDias); 
    }
};

// ============================================================================
// 2. MOTOR DE FOTOGRAFIA BASE64
// ============================================================================

class ImageEngine {
    static async fetchAsBase64(url, ms = 5000) {
        if (!url) return null;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: controller.signal 
            });
            clearTimeout(id);
            if (!response.ok) return null;
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const mime = response.headers.get('content-type') || 'image/jpeg';
            return `data:${mime};base64,${buffer.toString('base64')}`;
        } catch (e) {
            clearTimeout(id);
            return null;
        }
    }

    static async searchWikipedia(query) {
        if (!query) return null;
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000);
            let res = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=1`, { signal: controller.signal });
            clearTimeout(id);
            let data = await res.json();
            if (data.pages && data.pages.length > 0 && data.pages[0].thumbnail) {
                let url = data.pages[0].thumbnail.url;
                if (url.startsWith('//')) url = 'https:' + url;
                return url.replace(/\/\d+px-/, '/800px-'); 
            }
        } catch (e) {}
        return null;
    }

    static generateUniqueAIPhoto(keyword, index, width = 600, height = 900) {
        const safeQuery = encodeURIComponent(`${keyword} beautiful travel photography award winning`);
        const seed = Math.floor(Math.random() * 999999) + index;
        return `https://image.pollinations.ai/prompt/${safeQuery}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
    }

    static async getUniquePhotoUrl(landmark, city, index, usedImagesSet) {
        let imgUrl = await this.searchWikipedia(`${landmark}`);
        if (imgUrl && !usedImagesSet.has(imgUrl)) {
            usedImagesSet.add(imgUrl);
            return imgUrl;
        }

        imgUrl = await this.searchWikipedia(city);
        if (imgUrl && !usedImagesSet.has(imgUrl)) {
            usedImagesSet.add(imgUrl);
            return imgUrl;
        }

        imgUrl = this.generateUniqueAIPhoto(landmark || city, index);
        usedImagesSet.add(imgUrl);
        return imgUrl;
    }
}

// ============================================================================
// 3. INTELIGÊNCIA ARTIFICIAL E AUTO-CURA
// ============================================================================

class AIEngine {
    static async selectBestModel() {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
            const apiResp = await fetch(url);
            const apiData = await apiResp.json();
            
            if (apiData.models) {
                const validModels = apiData.models.filter(m => m.supportedGenerationMethods?.includes('generateContent'));
                const modelNames = validModels.map(m => m.name.replace('models/', ''));
                
                if (modelNames.includes('gemini-2.5-flash')) return 'gemini-2.5-flash';
                if (modelNames.includes('gemini-1.5-flash-latest')) return 'gemini-1.5-flash-latest';
                return modelNames[0];
            }
        } catch (e) {}
        return "gemini-1.5-flash"; 
    }

    static fixBrokenJSON(brokenString) {
        try {
            let cleanStr = brokenString.replace(/```json/g, '').replace(/```/g, '').trim();
            cleanStr = cleanStr.replace(/\n/g, ' ').replace(/\r/g, ' '); 

            try {
                return JSON.parse(cleanStr);
            } catch (e) {
                const lastBrace = cleanStr.lastIndexOf('}');
                if (lastBrace === -1) throw new Error("JSON sem formatação.");
                
                let fixedStr = cleanStr.substring(0, lastBrace + 1);
                if (!fixedStr.includes('"segredos"')) {
                    fixedStr += '], "segredos": ["Descubra os tesouros escondidos na madrugada.", "Acesso exclusivo aos locais restritos garantido pela mentoria."], "dicaOuro": "Aproveite cada momento com presença absoluta, desconectando-se do relógio.", "convite": "Aguardamos o seu contato para transformar este roteiro na sua próxima grande jornada."}';
                }
                return JSON.parse(fixedStr);
            }
        } catch (e) {
            throw new Error("A Inteligência Artificial produziu dados irremediáveis.");
        }
    }
}

// ============================================================================
// 4. CONSTRUTOR EDITORIAL
// ============================================================================

class DocumentBuilder {
    static build(dados, destinoFormatado, nomeCliente, primeiraCidade, coverB64, welcomeB64, strategyB64, endB64, dayImagesB64) {
        
        let htmlContent = `
            <div class="page cover-page">
                <div class="cover-left">
                    <div class="cover-sub">Dossier de Viagem Privado</div>
                    <h1 class="cover-title">A Essência de<br>${destinoFormatado}</h1>
                    <div class="cover-client">
                        <span>Curadoria Exclusiva Para</span>
                        <strong>${nomeCliente}</strong>
                    </div>
                    <div class="cover-logo">Lucas Janone • Mentoria Premium</div>
                </div>
                <div class="cover-right">
                    <img src="${coverB64 || 'err'}" alt="Capa" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="fallback-bg"><span>${primeiraCidade}</span></div>
                </div>
            </div>

            <div class="page">
                <div class="left-image-panel">
                    <img src="${welcomeB64 || 'err'}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="fallback-bg"><span>PRELÚDIO</span></div>
                </div>
                <div class="right-text-panel">
                    <div class="panel-tag">O PRELÚDIO</div>
                    <h2>Boas-Vindas</h2>
                    <p class="welcome-text first-letter-drop">${dados.boasVindas}</p>
                    <blockquote class="quote">"${dados.citacao.frase}"<br><strong>— ${dados.citacao.autor}</strong></blockquote>
                </div>
            </div>

            <div class="page">
                <div class="left-image-panel">
                    <img src="${strategyB64 || 'err'}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="fallback-bg"><span>CONFORTO</span></div>
                </div>
                <div class="right-text-panel">
                    <div class="panel-tag">LOGÍSTICA & PRIVILÉGIOS</div>
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
            const dayImageB64 = dayImagesB64[i];

            htmlContent += `
            <div class="page">
                <div class="left-image-panel">
                    <img src="${dayImageB64 || 'err'}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="fallback-bg"><span>${dia.cidade}</span></div>
                </div>
                <div class="right-text-panel">
                    <div class="watermark">${diaFormatado}</div>
                    <div class="content-above-watermark">
                        <div class="panel-tag">CAPÍTULO ${diaFormatado}</div>
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
            </div>
            `;
        }

        htmlContent += `
            <div class="page">
                <div class="left-image-panel">
                    <img src="${endB64 || 'err'}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="fallback-bg"><span>EPÍLOGO</span></div>
                </div>
                <div class="right-text-panel" style="justify-content: center;">
                    <div class="watermark-logo">LJ</div>
                    <div class="content-above-watermark">
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
            </div>
        `;

        return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
            <style>
                :root { --cream: #F9F8F6; --charcoal: #1A1A1A; --gold: #A67C52; --white: #FFFFFF; --gray: #666666; }
                @page { size: A4 landscape; margin: 0; }
                body { margin: 0; padding: 0; background-color: var(--cream); font-family: 'Montserrat', sans-serif; color: var(--charcoal); -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                
                .page { position: relative; width: 100vw; height: 100vh; page-break-after: always; display: flex; overflow: hidden; background-color: var(--cream); box-sizing: border-box; padding: 30px; }
                
                /* NOVA CAPA VOGUE SPLIT */
                .cover-page { padding: 0 !important; display: flex; flex-direction: row !important; background-color: var(--cream); }
                .cover-left { flex: 0 0 45%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px; text-align: center; position: relative; z-index: 10; }
                .cover-right { flex: 1; position: relative; overflow: hidden; background-color: var(--charcoal); }
                .cover-right img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.95); }
                
                .cover-sub { font-size: 13px; color: var(--gold); letter-spacing: 7px; text-transform: uppercase; font-weight: 600; margin-bottom: 25px; font-family: 'Montserrat', sans-serif;}
                .cover-title { font-family: 'Playfair Display', serif; font-size: 56px; margin: 0 0 35px 0; font-weight: 600; line-height: 1.1; color: var(--charcoal); text-transform: capitalize;}
                
                .cover-client { border-top: 1px solid rgba(26, 26, 26, 0.1); border-bottom: 1px solid rgba(26, 26, 26, 0.1); padding: 25px; margin-top: 15px; width: 80%;}
                .cover-client span { font-size: 10px; letter-spacing: 4px; color: var(--gray); text-transform: uppercase; }
                .cover-client strong { display: block; font-family: 'Playfair Display', serif; font-size: 28px; color: var(--charcoal); margin-top: 8px; font-weight: 700; letter-spacing: 2px;}
                .cover-logo { position: absolute; bottom: 40px; font-size: 11px; color: var(--gray); letter-spacing: 6px; text-transform: uppercase; font-weight: 500;}

                /* RESTO DO DESIGN EDITORIAL */
                .left-image-panel { flex: 0 0 45%; position: relative; border-radius: 4px; overflow: hidden; background-color: #E8E5DF; box-shadow: 10px 0 30px rgba(0,0,0,0.05);}
                .left-image-panel img { width: 100%; height: 100%; object-fit: cover; filter: saturate(1.05); }
                
                .fallback-bg { display: none; width: 100%; height: 100%; background: linear-gradient(135deg, #2C2C2C, #1A1A1A); align-items: center; justify-content: center; }
                .fallback-bg span { font-family: 'Playfair Display', serif; color: var(--gold); font-size: 28px; letter-spacing: 8px; text-transform: uppercase; opacity: 0.4; padding: 50px; text-align: center; border: 1px solid rgba(166,124,82,0.2);}

                .right-text-panel { flex: 1; padding: 50px 70px 50px 90px; display: flex; flex-direction: column; justify-content: center; position: relative;}
                
                .watermark { position: absolute; top: 50%; right: 50px; transform: translateY(-50%); font-family: 'Playfair Display', serif; font-size: 320px; color: var(--charcoal); opacity: 0.025; font-weight: 700; line-height: 1; pointer-events: none; z-index: 1;}
                .watermark-logo { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-family: 'Playfair Display', serif; font-size: 400px; color: var(--charcoal); opacity: 0.02; font-weight: 700; pointer-events: none; z-index: 1;}
                
                .content-above-watermark { position: relative; z-index: 10; }
                .right-text-panel h2 { font-family: 'Playfair Display', serif; font-size: 46px; margin: 0 0 25px 0; line-height: 1.1; color: var(--charcoal); font-weight: 600; }
                .day-title { font-size: 38px !important; margin-bottom: 35px !important; }
                
                .panel-tag { font-family: 'Montserrat', sans-serif; font-size: 11px; letter-spacing: 5px; color: var(--gold); margin-bottom: 18px; text-transform: uppercase; font-weight: 600;}

                p { font-size: 14px; line-height: 1.9; font-weight: 300; margin-bottom: 22px; color: #333; text-align: justify;}
                .first-letter-drop::first-letter { float: left; font-size: 55px; line-height: 45px; padding-top: 4px; padding-right: 8px; padding-left: 3px; font-family: 'Playfair Display', serif; color: var(--gold); font-weight: 600;}
                .welcome-text { font-size: 15.5px; line-height: 2; color: #222;}
                
                .quote { font-family: 'Playfair Display', serif; font-style: italic; font-size: 22px; color: var(--charcoal); border-left: 2px solid var(--gold); padding-left: 30px; margin: 40px 0; line-height: 1.6;}
                .quote strong { font-family: 'Montserrat', sans-serif; font-size: 10px; color: var(--gray); font-style: normal; letter-spacing: 4px; text-transform: uppercase; display: block; margin-top: 15px;}

                .luxury-list { list-style: none; padding: 0; margin: 0; }
                .luxury-list li { position: relative; padding-left: 25px; margin-bottom: 18px; font-size: 14px; line-height: 1.8; font-weight: 300; color: #333; text-align: justify;}
                .luxury-list li::before { content: ''; position: absolute; left: 0; top: 8px; width: 5px; height: 5px; background-color: var(--gold); transform: rotate(45deg); }

                .timeline { border-left: 1px solid rgba(166, 124, 82, 0.4); padding-left: 35px; margin-left: 5px; margin-top: 25px;}
                .timeline-item { position: relative; margin-bottom: 30px; }
                .timeline-item::before { content: ''; position: absolute; left: -39px; top: 4px; width: 7px; height: 7px; background: var(--cream); border: 1px solid var(--gold); border-radius: 50%; box-shadow: 0 0 0 3px var(--cream); }
                .time-label { font-family: 'Montserrat', sans-serif; font-size: 12px; color: var(--gold); letter-spacing: 4px; margin-bottom: 8px; font-weight: 600;}
                .time-content { font-size: 14px; font-weight: 300; line-height: 1.8; color: #333; margin: 0; text-align: justify; }

                .section-subtitle { font-family: 'Playfair Display', serif; font-size: 24px; color: var(--charcoal); margin: 0 0 18px 0; font-weight: 600; }
                
                .gold-box { background-color: var(--white); border: 1px solid rgba(166, 124, 82, 0.25); padding: 30px 40px; margin-top: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); position: relative; overflow: hidden;}
                .gold-box::before { content:''; position: absolute; top:0; left:0; width: 4px; height: 100%; background-color: var(--gold);}
                .gold-box-title { font-family: 'Montserrat', sans-serif; font-size: 11px; color: var(--gold); margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 4px; font-weight: 600;}
                .gold-box p { margin: 0; font-size: 14px; color: #222; line-height: 1.8; text-align: justify;}

                .final-invite { text-align: center; margin-top: 40px; padding-top: 25px; border-top: 1px solid rgba(26,26,26,0.1);}
                .final-invite p { font-family: 'Playfair Display', serif; font-size: 18px; color: var(--charcoal); margin: 0; font-style: italic; text-align: center;}
            </style>
        </head>
        <body>
            ${htmlContent}
        </body>
        </html>`;
    }
}

// ============================================================================
// 5. ORQUESTRAÇÃO PRINCIPAL
// ============================================================================

app.post('/api/gerar-roteiro', async (req, res) => {
    let browser = null; 
    Logger.info("Iniciando geração V33 - Capa Vogue Split.");

    try {
        const body = req.body;
        const nomeCliente = formatadores.nome(body.nome);
        const destinoFormatado = formatadores.destino(body.destino);
        const primeiraCidade = (body.destino || "").split(/,| e | - |\//)[0].trim(); 
        const numDias = formatadores.extrairDias(body);

        const targetModel = await AIEngine.selectBestModel();
        
        const regraTamanho = numDias > 10 
            ? "Regra de Ouro: Escreva no MÁXIMO 2 frases curtas por turno."
            : "Regra de Ouro: Escreva de forma poética, limitado a 3 frases por turno.";

        const prompt = `Você é Lucas Janone, curador de viagens da elite.
        Crie um roteiro premium de EXATAMENTE ${numDias} DIAS para ${nomeCliente}. Destino(s): ${destinoFormatado}.
        
        ${regraTamanho}
        
        REGRAS CRÍTICAS DE SISTEMA:
        1. Nunca use aspas duplas (") nos textos, apenas aspas simples (').
        2. Nunca use a tecla Enter/Quebra de linha dentro dos textos.
        3. O campo "fotografia_cenario" DEVE ser o nome de um marco geográfico famoso EM INGLÊS (Ex: Eiffel Tower). Não repita locais.

        Retorne EXCLUSIVAMENTE este JSON:
        {
          "boasVindas": "Mensagem majestosa.",
          "citacao": { "frase": "Citação sobre viagem sem aspas duplas internas.", "autor": "Autor" },
          "estrategia": [ "Parágrafo 1.", "Parágrafo 2." ],
          "dias": [
            {
              "dia": 1,
              "titulo": "Cidade: Título",
              "cidade": "Nome da Cidade",
              "fotografia_cenario": "Famous Landmark in English",
              "manha": "Texto manha.",
              "tarde": "Texto tarde.",
              "noite": "Texto noite."
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
        
        let dados;
        try {
            dados = JSON.parse(result.response.text());
        } catch (e) {
            dados = AIEngine.fixBrokenJSON(result.response.text());
        }

        Logger.info(`Acionando Motor de Download Direto (Base64)...`);

        const usedImagesSet = new Set();
        
        // A Capa agora é 100% gerada por IA de alta definição para garantir o estilo "Cinematic Landscape"
        const coverUrl = ImageEngine.generateUniqueAIPhoto(`${primeiraCidade} breathtaking cinematic landscape travel photography`, 999, 1000, 1200);

        const welcomeUrl = ImageEngine.generateUniqueAIPhoto(`luxury private resort sunset ${primeiraCidade}`, 101);
        const strategyUrl = ImageEngine.generateUniqueAIPhoto(`fine dining luxury champagne Michelin`, 202);
        const endUrl = ImageEngine.generateUniqueAIPhoto(`beautiful private jet or yacht sunset`, 303);

        const dayUrls = await Promise.all(dados.dias.map((dia, index) => {
            return ImageEngine.getUniquePhotoUrl(dia.fotografia_cenario, dia.cidade, index, usedImagesSet);
        }));

        Logger.info(`Baixando fotos para a memória do servidor...`);

        const [coverB64, welcomeB64, strategyB64, endB64, ...dayImagesB64] = await Promise.all([
            ImageEngine.fetchAsBase64(coverUrl),
            ImageEngine.fetchAsBase64(welcomeUrl),
            ImageEngine.fetchAsBase64(strategyUrl),
            ImageEngine.fetchAsBase64(endUrl),
            ...dayUrls.map(url => ImageEngine.fetchAsBase64(url))
        ]);

        Logger.info("Fotos prontas. Injetando no HTML e imprimindo PDF instantaneamente...");
        
        const finalHTML = DocumentBuilder.build(dados, destinoFormatado, nomeCliente, primeiraCidade, coverB64, welcomeB64, strategyB64, endB64, dayImagesB64);

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
        
        await page.setContent(finalHTML, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ path: filePath, format: 'A4', landscape: true, printBackground: true, timeout: 60000 });
        
        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        Logger.info(`SUCESSO DEFINITIVO V33! Obras de arte impressas na hora: ${pdfUrl}`);
        res.json({ pdfUrl });

    } catch (error) {
        Logger.error('Falha crítica na rota principal.', error.message);
        res.status(500).json({ error: 'Erro no servidor. A IA gerou dados inválidos ou houve falha de conexão.' });
    } finally {
        if (browser !== null) {
            await browser.close().catch(e => Logger.error('Erro ao fechar o navegador.', e));
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô V33 (Capa Vogue Split) operando na porta ${PORT}`);
});