/**
 * ============================================================================
 * SISTEMA GERADOR DE ROTEIROS DE ALTO LUXO - VERSÃO 26 (ENTERPRISE EDITION)
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

// 1. INICIALIZAÇÃO DO SERVIDOR (A Chave de Ignição)
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

// 2. CRIAÇÃO DA PASTA DE ARQUIVOS (O Cofre de PDFs)
const pdfsDir = path.join(__dirname, 'public', 'pdfs');
if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });
app.use('/pdfs', express.static(pdfsDir));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================================================
// 3. UTILITÁRIOS E CLASSES DE SUPORTE (LOGS E FORMATAÇÃO)
// ============================================================================

class Logger {
    static info(msg, data = '') {
        console.log(`[INFO] [${new Date().toISOString()}] ${msg}`, data);
    }
    static warn(msg, data = '') {
        console.warn(`[WARN] [${new Date().toISOString()}] ⚠️ ${msg}`, data);
    }
    static error(msg, error) {
        console.error(`[ERROR] [${new Date().toISOString()}] ❌ ${msg}`, error);
    }
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
            
            if (chaveDias && !isNaN(parseInt(chaveDias))) {
                numDias = parseInt(chaveDias);
            } else if (matchDias && parseInt(matchDias[1]) > 0) {
                numDias = parseInt(matchDias[1]); 
            } else if (body.dataViagem && body.dataVolta) {
                const d1 = new Date(body.dataViagem);
                const d2 = new Date(body.dataVolta);
                if (!isNaN(d1) && !isNaN(d2)) {
                    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                    if (diff > 0) numDias = diff + 1; 
                }
            }
        } catch (e) { Logger.warn("Erro ao calcular dias. Usando padrão."); }
        return numDias > 30 ? 30 : (numDias < 1 ? 5 : numDias); 
    }
};

// ============================================================================
// 4. MOTORES DE BUSCA DE IMAGENS (SISTEMA EM CASCATA TRIPLA)
// ============================================================================

class ImageEngine {
    static async fetchWithTimeout(url, ms = 4000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            throw new Error('Timeout da Imagem');
        }
    }

    static async getWikiImage(query) {
        if (!query) return null;
        try {
            let res = await this.fetchWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, 3500);
            let data = await res.json();
            if (data.thumbnail && data.thumbnail.source) {
                return data.thumbnail.source.replace(/\/\d+px-/, '/800px-'); 
            }
        } catch (e) {}
        return null;
    }

    static getFallbackImage(keyword, index) {
        const safeWord = encodeURIComponent((keyword || 'luxury').split(' ')[0].replace(/[^a-zA-Z0-9]/g, ''));
        return `https://loremflickr.com/600/900/${safeWord},architecture/all?lock=${index}`;
    }

    static getAIGeneratedImage(keyword) {
        const safeQuery = encodeURIComponent(`${keyword} beautiful cinematic travel photography`);
        const seed = Math.floor(Math.random() * 99999);
        return `https://image.pollinations.ai/prompt/${safeQuery}?width=600&height=900&nologo=true&seed=${seed}`;
    }

    static async getBestImage(primaryQuery, fallbackQuery, index) {
        let img = await this.getWikiImage(primaryQuery);
        if (img) return img;

        img = await this.getWikiImage(fallbackQuery);
        if (img) return img;

        return this.getFallbackImage(primaryQuery || fallbackQuery, index);
    }
}

// ============================================================================
// 5. INTELIGÊNCIA ARTIFICIAL E AUTO-CURA (WOLVERINE PROTOCOL)
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
                
                Logger.info("Modelos de IA disponíveis:", modelNames.join(', '));
                
                if (modelNames.includes('gemini-2.5-flash')) return 'gemini-2.5-flash';
                if (modelNames.includes('gemini-1.5-flash-latest')) return 'gemini-1.5-flash-latest';
                if (modelNames.includes('gemini-2.0-flash')) return 'gemini-2.0-flash';
                return modelNames[0];
            }
        } catch (e) {
            Logger.warn("Falha no Scanner de IA. Usando fallback.");
        }
        return "gemini-1.5-flash"; 
    }

    static fixBrokenJSON(brokenString) {
        Logger.warn("Iniciando protocolo de Auto-Cura de JSON...");
        try {
            let cleanStr = brokenString.replace(/```json/g, '').replace(/```/g, '').trim();
            const lastBrace = cleanStr.lastIndexOf('}');
            
            if (lastBrace === -1) throw new Error("JSON irrecuperável");
            
            let fixedStr = cleanStr.substring(0, lastBrace + 1);
            
            if (!fixedStr.includes('"segredos"')) {
                fixedStr = fixedStr.substring(0, fixedStr.lastIndexOf('}')); 
                fixedStr += '], "segredos": ["Descubra os tesouros escondidos nas vielas.", "Um local reservado apenas para os verdadeiros conhecedores."], "dicaOuro": "Aproveite cada momento com presença absoluta, desconectando-se do relógio.", "convite": "Aguardamos seu contato para transformar este esboço na sua próxima grande jornada."}';
            }
            
            return JSON.parse(fixedStr);
        } catch (e) {
            Logger.error("Auto-Cura Falhou.", e.message);
            throw new Error("A Inteligência Artificial produziu dados irremediáveis.");
        }
    }
}

// ============================================================================
// 6. CONSTRUTOR DE DESIGN EDITORIAL (HTML E CSS GIGANTE)
// ============================================================================

class DocumentBuilder {
    static build(dados, destinoFormatado, nomeCliente, primeiraCidade, imagesMap) {
        
        let htmlContent = `
            <div class="page">
                <div class="cover-image-wrapper">
                    <img class="cover-bg" src="${ImageEngine.getAIGeneratedImage(primeiraCidade + ' landmark')}" alt="Capa">
                    <div class="fallback-bg"><span>${primeiraCidade}</span></div>
                </div>
                <div class="cover-content">
                    <div class="cover-sub">Dossier de Viagem Privado</div>
                    <h1 class="cover-title">A Essência de<br>${destinoFormatado}</h1>
                    <div class="cover-client">
                        <span>Curadoria Exclusiva Para</span>
                        <strong>${nomeCliente}</strong>
                    </div>
                </div>
                <div class="cover-logo">Lucas Janone • Mentoria Premium</div>
            </div>

            <div class="page">
                <div class="left-image-panel">
                    <img src="${ImageEngine.getAIGeneratedImage(primeiraCidade + ' luxury resort')}" alt="Boas Vindas">
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
                    <img src="${ImageEngine.getAIGeneratedImage('fine dining luxury champagne')}" alt="Estratégia">
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

        // DIAS DO ROTEIRO
        for (let i = 0; i < dados.dias.length; i++) {
            const dia = dados.dias[i];
            const diaFormatado = dia.dia < 10 ? `0${dia.dia}` : dia.dia;
            const dayImageUrl = imagesMap[i] || ImageEngine.getFallbackImage(dia.cidade, i);

            htmlContent += `
            <div class="page">
                <div class="left-image-panel">
                    <img src="${dayImageUrl}" alt="${dia.titulo}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
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

        // DESPEDIDA
        htmlContent += `
            <div class="page">
                <div class="left-image-panel">
                    <img src="${ImageEngine.getAIGeneratedImage('beautiful sunset luxury yacht')}" alt="Despedida">
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

        // CSS MONUMENTAL
        return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
            <style>
                :root { 
                    --cream: #F9F8F6; 
                    --charcoal: #1A1A1A; 
                    --gold: #A67C52; 
                    --white: #FFFFFF;
                    --gray: #666666;
                }
                
                @page { size: A4 landscape; margin: 0; }
                
                body { 
                    margin: 0; padding: 0; 
                    background-color: var(--cream); 
                    font-family: 'Montserrat', sans-serif; 
                    color: var(--charcoal); 
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                
                .page { 
                    position: relative; width: 100vw; height: 100vh; 
                    page-break-after: always; display: flex; overflow: hidden; 
                    background-color: var(--cream); box-sizing: border-box; padding: 30px;
                }
                
                .cover { 
                    position: relative; width: 100vw; height: 100vh; display: flex; 
                    flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; padding: 30px; 
                    box-sizing: border-box; background-color: var(--cream);
                }
                .cover-image-wrapper { 
                    position: absolute; top: 30px; left: 30px; right: 30px; bottom: 30px; 
                    overflow: hidden; border-radius: 4px; box-shadow: inset 0 0 50px rgba(0,0,0,0.5);
                }
                .cover-bg { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.80) contrast(1.1); }
                
                .cover-content { 
                    position: relative; z-index: 20; background: rgba(249, 248, 246, 0.92); 
                    padding: 70px 90px; border: 1px solid rgba(166, 124, 82, 0.4); 
                    border-radius: 2px; max-width: 750px; box-shadow: 0 20px 50px rgba(0,0,0,0.1);
                    backdrop-filter: blur(5px);
                }
                
                .cover-sub { font-size: 13px; color: var(--gold); letter-spacing: 7px; text-transform: uppercase; font-weight: 600; margin-bottom: 25px; font-family: 'Montserrat', sans-serif;}
                .cover-title { font-family: 'Playfair Display', serif; font-size: 56px; margin: 0 0 35px 0; font-weight: 600; line-height: 1.1; color: var(--charcoal); text-transform: capitalize;}
                
                .cover-client { border-top: 1px solid rgba(26, 26, 26, 0.1); border-bottom: 1px solid rgba(26, 26, 26, 0.1); padding: 25px; margin-top: 15px;}
                .cover-client span { font-size: 10px; letter-spacing: 4px; color: var(--gray); text-transform: uppercase; }
                .cover-client strong { display: block; font-family: 'Playfair Display', serif; font-size: 28px; color: var(--charcoal); margin-top: 8px; font-weight: 700; letter-spacing: 2px;}
                
                .cover-logo { position: absolute; bottom: 60px; font-size: 11px; color: var(--white); letter-spacing: 6px; text-transform: uppercase; z-index: 20; text-shadow: 1px 1px 6px rgba(0,0,0,0.8); font-weight: 500;}

                .left-image-panel { flex: 0 0 45%; position: relative; border-radius: 4px; overflow: hidden; background-color: #E8E5DF; box-shadow: 10px 0 30px rgba(0,0,0,0.05);}
                .left-image-panel img { width: 100%; height: 100%; object-fit: cover; filter: saturate(1.05); }
                
                .fallback-bg { display: none; width: 100%; height: 100%; background: linear-gradient(135deg, #1A1A1A, #0A0A0A); align-items: center; justify-content: center; }
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
// 7. ORQUESTRAÇÃO PRINCIPAL (ROTA DA API)
// ============================================================================

app.post('/api/gerar-roteiro', async (req, res) => {
    let browser = null; 
    Logger.info("Iniciando requisição de geração de roteiro.");

    try {
        const body = req.body;
        const nomeCliente = formatadores.nome(body.nome);
        const destinoFormatado = formatadores.destino(body.destino);
        const primeiraCidade = (body.destino || "").split(/,| e | - |\//)[0].trim(); 
        const numDias = formatadores.extrairDias(body);

        Logger.info(`Configuração: Cliente: ${nomeCliente}, Destino: ${destinoFormatado}, Dias: ${numDias}`);

        const targetModel = await AIEngine.selectBestModel();
        
        const regraTamanho = numDias > 10 
            ? "Regra de Ouro: Escreva no MÁXIMO 2 frases por turno. Seja conciso e elegante."
            : "Regra de Ouro: Escreva de forma poética, limitado a 3 frases por turno.";

        const prompt = `Você é Lucas Janone, curador de viagens da elite.
        Crie um roteiro premium de EXATAMENTE ${numDias} DIAS para ${nomeCliente}. Destino(s): ${destinoFormatado}.
        
        ${regraTamanho}
        
        REGRAS CRÍTICAS DE SISTEMA:
        1. Nunca use aspas duplas (") nos textos, apenas aspas simples (').
        2. O campo "fotografia_cenario" DEVE ser o nome exato de um marco geográfico real da cidade em Inglês (Ex: Colosseum, Mount Fuji, Central Park). Não repita locais.

        Retorne EXCLUSIVAMENTE este JSON:
        {
          "boasVindas": "Mensagem majestosa.",
          "citacao": { "frase": "Citação sobre viagem.", "autor": "Autor" },
          "estrategia": [ "Parágrafo 1.", "Parágrafo 2." ],
          "dias": [
            {
              "dia": 1,
              "titulo": "Cidade: Título",
              "cidade": "Nome da Cidade",
              "fotografia_cenario": "Landmark in English",
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

        Logger.info(`Roteiro extraído com sucesso. Coletando banco de imagens geográficas...`);

        const dayImagesUrls = await Promise.all(dados.dias.map((dia, index) => {
            return ImageEngine.getBestImage(dia.fotografia_cenario, dia.cidade, index);
        }));

        Logger.info("Desenhando a arquitetura HTML...");
        const finalHTML = DocumentBuilder.build(dados, destinoFormatado, nomeCliente, primeiraCidade, dayImagesUrls);

        browser = await puppeteer.launch({ 
            headless: 'new',
            protocolTimeout: 240000, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu', 
                '--no-zygote',
                '--single-process',
                '--disable-web-security'
            ] 
        });
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setJavaScriptEnabled(true);
        
        try {
            Logger.info("Renderizando PDF. Aguardando limites máximos para mídia pesada...");
            await page.setContent(finalHTML, { waitUntil: 'networkidle0', timeout: 60000 });
        } catch (e) {
            Logger.warn("Tempo de rede esgotado. Forçando a impressão de segurança.");
        }
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ path: filePath, format: 'A4', landscape: true, printBackground: true });
        
        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        Logger.info(`SUCESSO GLOBAL! PDF Enterprise gerado: ${pdfUrl}`);
        res.json({ pdfUrl });

    } catch (error) {
        Logger.error('Falha crítica na rota principal.', error.message);
        res.status(500).json({ error: 'Erro no servidor. Tente novamente em instantes.' });
    } finally {
        if (browser !== null) {
            await browser.close().catch(e => Logger.error('Erro ao fechar Puppeteer.', e));
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô V26 (Enterprise Edition Operacional) rodando na porta ${PORT}`);
});