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

app.post('/api/gerar-roteiro', async (req, res) => {
    try {
        const { nome, dataViagem, numeroViajantes, destino, orcamento, mustHaves } = req.body;
        const nomeCliente = formatarNome(nome);
        const destinoLimpo = destino.trim().split(',')[0]; 
        
        console.log(`[LOG] Iniciando Roteiro Editorial de Luxo para: ${nomeCliente} - Destino: ${destino}`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const apiResp = await fetch(url);
        const apiData = await apiResp.json();
        
        let targetModel = "gemini-1.5-flash"; 
        if (apiData.models) {
            const availableModels = apiData.models.filter(m => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'));
            if (availableModels.length > 0) targetModel = availableModels.find(m => m.name.includes('flash'))?.name.replace('models/', '') || availableModels[0].name.replace('models/', '');
        }

        // CÉREBRO JSON: Textos impecáveis
        const prompt = `Você é Lucas Janone, curador de viagens de alto luxo.
        Crie um roteiro premium impecável para ${nomeCliente} viajando para ${destino} (${numeroViajantes} pessoas, R$ ${orcamento}, Exigências: ${mustHaves}).
        
        RETORNE EXCLUSIVAMENTE UM OBJETO JSON VÁLIDO. NÃO ESCREVA MAIS NADA ALÉM DO JSON.
        Regra de Ouro: Escreva de forma elegante, culta e inspiradora. Não use excesso de exclamações.
        
        Use exatamente esta estrutura:
        {
          "boasVindas": "Carta inicial requintada...",
          "citacao": {
            "frase": "A frase inspiradora aqui",
            "autor": "Nome do Autor"
          },
          "estrategia": [
            "Tópico 1 da estratégia",
            "Tópico 2 da estratégia..."
          ],
          "dias": [
            {
              "dia": 1,
              "titulo": "Título elegante do dia",
              "manha": "Atividades da manhã...",
              "tarde": "Atividades da tarde...",
              "noite": "Atividades da noite..."
            }
          ],
          "segredos": [
            "Segredo local 1",
            "Segredo local 2",
            "Segredo local 3"
          ],
          "dicaOuro": "Sua dica valiosa e exclusiva...",
          "convite": "Seu convite final e sofisticado..."
        }`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        
        const jsonStr = result.response.text();
        const dados = JSON.parse(jsonStr);

        console.log(`[LOG] Textos gerados com sucesso. Montando o Design Editorial...`);

        // CONSTRUÇÃO DO HTML EDITORIAL (Zero imagens genéricas, foco em tipografia de luxo)
        let roteiroHTML = `
            <div class="section-title">
                <h2>O Prelúdio da Jornada</h2>
            </div>
            <p class="welcome-text">${dados.boasVindas}</p>
            <blockquote class="quote">"${dados.citacao.frase}"<br><strong>— ${dados.citacao.autor}</strong></blockquote>
            
            <div class="section-title" style="page-break-before: always; padding-top: 40px;">
                <h2>Estratégia de Investimento</h2>
            </div>
            <ul class="strategy-list">
                ${dados.estrategia.map(item => `<li>${item}</li>`).join('')}
            </ul>
        `;

        for (let i = 0; i < dados.dias.length; i++) {
            const dia = dados.dias[i];
            const diaFormatado = dia.dia < 10 ? `0${dia.dia}` : dia.dia;
            
            roteiroHTML += `
            <div class="chapter-header">
                <div class="chapter-number">${diaFormatado}</div>
                <div class="chapter-info">
                    <span class="chapter-label">CAPÍTULO</span>
                    <h2>${dia.titulo}</h2>
                </div>
            </div>
            
            <div class="turn-box">
                <h3><span class="turn-icon">I.</span> Manhã</h3>
                <p>${dia.manha}</p>
            </div>
            
            <div class="turn-box">
                <h3><span class="turn-icon">II.</span> Tarde</h3>
                <p>${dia.tarde}</p>
            </div>
            
            <div class="turn-box">
                <h3><span class="turn-icon">III.</span> Noite</h3>
                <p>${dia.noite}</p>
            </div>
            `;
        }

        roteiroHTML += `
            <div class="section-title" style="page-break-before: always; padding-top: 40px;">
                <h2>Segredos de ${destinoLimpo}</h2>
            </div>
            <ul class="secrets-list">
                ${dados.segredos.map(segredo => `<li>${segredo}</li>`).join('')}
            </ul>

            <div class="dica-lucas">
                <strong>A Assinatura de Lucas Janone</strong>
                <p>${dados.dicaOuro}</p>
            </div>

            <div class="section-title">
                <h2>O Próximo Passo</h2>
            </div>
            <p style="text-align: center; font-size: 16px; margin-bottom: 50px;">${dados.convite}</p>
        `;

        // Tentativa de Capa Cinematográfica. Se a IA bloquear, o CSS cuida de deixar chique.
        const seed = Math.floor(Math.random() * 999999);
        const coverImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent('beautiful cinematic luxury travel photography ' + destinoLimpo + ' stunning famous landmark 4k no text')}?width=1200&height=1600&nologo=true&seed=${seed}`;

        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">
            
            <style>
                :root { 
                    --navy: #070F22; 
                    --gold: #D4AF37; 
                    --gold-light: rgba(212, 175, 55, 0.15);
                    --text: #2A2A2A; 
                    --bg: #FDFDFD; 
                }
                @page { margin: 0; }
                body { 
                    font-family: 'Montserrat', sans-serif; 
                    color: var(--text); 
                    background-color: var(--bg); 
                    margin: 0; padding: 0; line-height: 1.8; 
                }
                
                /* CAPA BLINDADA - Fundo Elegante de Segurança caso a imagem não carregue */
                .cover { 
                    height: 100vh; width: 100vw; max-height: 100vh; overflow: hidden; 
                    background-color: var(--navy); 
                    background-image: 
                        linear-gradient(rgba(7, 15, 34, 0.75), rgba(7, 15, 34, 0.95)), 
                        url('${coverImageUrl}');
                    background-size: cover; background-position: center;
                    color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; padding: 40px; box-sizing: border-box; 
                    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
                }
                .cover-subtitle { font-family: 'Montserrat', sans-serif; color: var(--gold); font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 6px; margin-bottom: 30px; }
                .cover-title { font-family: 'Cinzel', serif; font-size: 54px; font-weight: 600; margin: 0 0 40px 0; line-height: 1.15; letter-spacing: 2px;}
                
                .cover-client-box { border-top: 1px solid var(--gold); border-bottom: 1px solid var(--gold); padding: 25px 0; margin-top: 15px; width: 60%; max-width: 400px; }
                .cover-client { font-family: 'Montserrat', sans-serif; font-size: 12px; font-weight: 400; color: #CCCCCC; text-transform: uppercase; letter-spacing: 3px; }
                .cover-client strong { color: #FFFFFF; font-weight: 500; font-size: 22px; display: block; margin-top: 8px; font-family: 'Cinzel', serif; letter-spacing: 2px;}
                
                .cover-logo { margin-top: auto; font-family: 'Montserrat', sans-serif; font-size: 10px; color: var(--gold); letter-spacing: 4px; text-transform: uppercase; padding-bottom: 20px; font-weight: 500;}

                /* CONTEÚDO EDITORIAL MINIMALISTA */
                .content-wrapper { padding: 60px 90px; } 
                
                .section-title { text-align: center; margin-bottom: 40px; }
                .section-title h2 { font-family: 'Cinzel', serif; color: var(--navy); font-size: 28px; margin: 0; font-weight: 600; letter-spacing: 1px;}
                .section-title h2::after { content: ''; display: block; width: 40px; height: 2px; background-color: var(--gold); margin: 15px auto 0; }
                
                p { font-size: 14px; color: var(--text); text-align: justify; margin-bottom: 20px; font-weight: 300; }
                .welcome-text { font-size: 15px; line-height: 2; text-align: center; }
                
                /* TÍTULOS DOS DIAS: ESTILO REVISTA DE LUXO */
                .chapter-header { 
                    display: flex; align-items: center; margin-top: 60px; margin-bottom: 30px; 
                    border-bottom: 1px solid var(--gold-light); padding-bottom: 20px;
                    page-break-inside: avoid;
                }
                .content-wrapper > .chapter-header:first-of-type { margin-top: 10px; }
                .chapter-number { 
                    font-family: 'Cinzel', serif; font-size: 65px; font-weight: 700; 
                    color: var(--gold); line-height: 1; margin-right: 25px; 
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.05);
                }
                .chapter-info { display: flex; flex-direction: column; }
                .chapter-label { font-size: 10px; color: #888; letter-spacing: 3px; font-weight: 600; margin-bottom: 5px; }
                .chapter-info h2 { font-family: 'Cinzel', serif; font-size: 26px; color: var(--navy); margin: 0; font-weight: 600; }
                
                /* ESTRUTURA DOS TURNOS */
                .turn-box { margin-bottom: 25px; page-break-inside: avoid; padding-left: 20px; border-left: 1px solid var(--gold-light); }
                .turn-box h3 { font-family: 'Montserrat', sans-serif; font-size: 13px; color: var(--navy); text-transform: uppercase; letter-spacing: 2px; margin: 0 0 10px 0; font-weight: 600;}
                .turn-icon { color: var(--gold); margin-right: 5px; font-family: 'Cinzel', serif; font-weight: 700;}
                
                /* LISTAS ELEGANTES */
                .strategy-list, .secrets-list { list-style: none; padding: 0; }
                .strategy-list li, .secrets-list li { 
                    position: relative; padding-left: 25px; margin-bottom: 20px; 
                    font-size: 14px; font-weight: 300; text-align: justify;
                }
                .strategy-list li::before, .secrets-list li::before { 
                    content: '♦'; position: absolute; left: 0; top: 0; 
                    color: var(--gold); font-size: 12px; 
                }
                
                /* CITAÇÕES */
                .quote { 
                    font-family: 'Cinzel', serif; font-style: italic; color: var(--navy); text-align: center; 
                    margin: 60px 0; font-size: 20px; line-height: 1.6; padding: 0 40px; 
                }
                .quote strong { font-family: 'Montserrat', sans-serif; color: var(--gold); display: block; margin-top: 20px; font-size: 11px; text-transform: uppercase; font-style: normal; letter-spacing: 3px; font-weight: 600; }
                
                /* CAIXA DE ASSINATURA */
                .dica-lucas { 
                    background-color: var(--navy); color: white; padding: 45px; 
                    margin: 60px 0; text-align: center; page-break-inside: avoid;
                    border: 1px solid var(--gold);
                }
                .dica-lucas strong { font-family: 'Cinzel', serif; color: var(--gold); display: block; margin-bottom: 20px; font-size: 18px; font-weight: 600; letter-spacing: 1px;}
                .dica-lucas p { color: #E0E0E0; text-align: center; margin: 0; font-size: 14px;}
            </style>
        </head>
        <body>
            <div class="cover">
                <div class="cover-subtitle">Dossier de Viagem Privado</div>
                <h1 class="cover-title">A Essência de<br>${destinoLimpo}</h1>
                <div class="cover-client-box">
                    <div class="cover-client">Curadoria Exclusiva Para<br><strong>${nomeCliente}</strong></div>
                </div>
                <div class="cover-logo">Lucas Janone • Mentoria Premium</div>
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
        
        // Timeout de 15s. Se a imagem da capa não carregar, o Puppeteer avança e o fundo Azul/Ouro assume.
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => console.log('[AVISO] Tempo de imagem esgotado, aplicando design de segurança.'));
        
        await page.evaluateHandle('document.fonts.ready');
        await new Promise(r => setTimeout(r, 1000));
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ path: filePath, format: 'A4', printBackground: true });
        await browser.close();

        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        console.log(`[LOG] SUCESSO EDITORIAL! PDF gerado: ${pdfUrl}`);
        res.json({ pdfUrl });

    } catch (error) {
        console.error('[ERRO FATAL]', error);
        res.status(500).json({ error: 'Falha ao gerar o roteiro' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô Editorial rodando na porta ${PORT}`);
});