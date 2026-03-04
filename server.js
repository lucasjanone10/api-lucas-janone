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

// MOTOR BASE64 BLINDADO E SEM MARCAS D'ÁGUA
async function getBase64Image(prompt, width, height) {
    try {
        const seed = Math.floor(Math.random() * 999999);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
        
        // Máscara fortificada para parecer um usuário Mac Premium
        const response = await fetch(url, { 
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'image/jpeg, image/png',
                'Referer': 'https://pollinations.ai/'
            }
        });
        
        if (!response.ok) throw new Error(`Bloqueio: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.warn(`[AVISO] IA bloqueada. Acionando Plano B (Imagem Artística Limpa)...`);
        try {
            // PLANO B DE LUXO: Uma imagem fotográfica de altíssima qualidade abstrata (sem fotógrafos ou marcas)
            const seed = Math.floor(Math.random() * 1000);
            // Usando Picsum com blur sutil para dar um ar "artístico e limpo" caso a foto principal falhe
            const fallbackUrl = `https://picsum.photos/seed/${seed}/${width}/${height}?blur=2`;
            const res = await fetch(fallbackUrl, { timeout: 10000 });
            const arr = await res.arrayBuffer();
            return `data:image/jpeg;base64,${Buffer.from(arr).toString('base64')}`;
        } catch (fatalError) {
            // Se até o plano B falhar, injeta um fundo Ouro Champanhe minimalista
            return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        }
    }
}

app.post('/api/gerar-roteiro', async (req, res) => {
    try {
        const { nome, dataViagem, numeroViajantes, destino, orcamento, mustHaves } = req.body;
        const nomeCliente = formatarNome(nome);
        
        console.log(`[LOG] Iniciando Roteiro Old Money para: ${nomeCliente} - Destino: ${destino}`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const apiResp = await fetch(url);
        const apiData = await apiResp.json();
        
        let targetModel = "gemini-1.5-flash"; 
        if (apiData.models) {
            const availableModels = apiData.models.filter(m => 
                m.name.includes('gemini') && 
                m.supportedGenerationMethods?.includes('generateContent')
            );
            if (availableModels.length > 0) {
                const flashModel = availableModels.find(m => m.name.includes('flash'));
                targetModel = flashModel ? flashModel.name.replace('models/', '') : availableModels[0].name.replace('models/', '');
            }
        }

        const prompt = `Você é Lucas Janone, especialista em viagens de alto luxo. Crie um roteiro premium com tom de voz sofisticado, elegante e exclusivo.
        Cliente: ${nomeCliente} | Destino: ${destino} | Data: ${dataViagem} | Viajantes: ${numeroViajantes} | Orçamento: R$ ${orcamento} (EM REAIS) | Exigências: ${mustHaves}
        
        REGRAS DE CÓDIGO E ELEGÂNCIA:
        - Responda APENAS com HTML limpo.
        - Textos devem ser refinados. Proibido usar vocabulário clichê de turista.
        - NUNCA USE CAPS LOCK (TUDO MAIÚSCULO).
        - Use <h2> para os dias (Ex: <h2>Dia 1: A Essência de ${destino}</h2>).
        - Use <h3> para os turnos (Ex: <h3>Manhã: Descobertas</h3>).
        - CITAÇÃO: Após a introdução, use <blockquote class="quote">"Frase inspiradora sobre viagens" <br><strong>— Autor</strong></blockquote>
        
        ESTRUTURA:
        1. Carta de boas-vindas exclusiva a ${nomeCliente}.
        2. A Citação.
        3. Estratégia de Investimento em Experiências (EM REAIS).
        4. Roteiro Dia a Dia (insira naturalmente a frase: "Como eu sempre ensino aos meus alunos da Mentoria, o verdadeiro luxo está em...").
        5. 3 Segredos Locais (Curiosidades requintadas).
        6. A Dica de Ouro do Lucas.
        7. Convite elegante e discreto para a Mentoria de Viagens.`;

        const model = genAI.getGenerativeModel({ model: targetModel });
        const result = await model.generateContent(prompt);
        let roteiroHTML = result.response.text();
        roteiroHTML = roteiroHTML.replace(/```html|```/g, '');

        console.log(`[LOG] Baixando imagens 4K com pausa de segurança...`);
        const temas = ["beautiful cinematic landscape", "luxury travel photography", "high end resort or landmark scenery", "elegant scenic view", "stunning nature or architecture"];
        const destinoFormatado = destino.trim();
        
        const partes = roteiroHTML.split(/(<h2.*?>.*?<\/h2>)/g);
        let novoHTML = "";
        let imageCounter = 0;
        
        for (let parte of partes) {
            if (parte.startsWith('<h2')) {
                const temaAtual = temas[imageCounter % temas.length];
                const promptFoto = `${temaAtual} in ${destinoFormatado} 4k highly detailed no text`;
                
                console.log(`[LOG] Solicitando imagem ${imageCounter + 1}...`);
                const base64Img = await getBase64Image(promptFoto, 800, 450); // Formato mais "wide" de cinema
                
                novoHTML += `\n<div class="day-header">\n${parte}\n<div class="img-container"><img class="day-image" src="${base64Img}" alt="Visual Exclusivo"></div>\n</div>\n`;
                
                imageCounter++;
                await delay(2000); // Pausa de 2 segundos garantida para evitar qualquer bloqueio
            } else {
                novoHTML += parte;
            }
        }
        roteiroHTML = novoHTML;

        console.log(`[LOG] Gerando a Capa de Luxo...`);
        const coverBase64 = await getBase64Image(`beautiful cinematic luxury travel photography ${destinoFormatado} stunning famous landmark masterpiece 4k no text`, 900, 1200);

        // O CSS "OLD MONEY" (Azul Marinho, Ouro Champanhe, Linhas Finas)
        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Cinzel:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
            
            <style>
                :root {
                    --navy: #0A1128;
                    --gold: #C5A059;
                    --text: #2C3E50;
                    --bg: #FAFAFA;
                }

                @page { margin: 0; }
                
                body { 
                    font-family: 'Lato', sans-serif; 
                    color: var(--text); 
                    background-color: var(--bg); 
                    margin: 0; padding: 0; line-height: 1.8; 
                }
                
                /* CAPA DE ALTA COSTURA */
                .cover { 
                    height: 100vh; width: 100vw;
                    background-color: var(--navy); 
                    background-image: linear-gradient(rgba(10, 17, 40, 0.65), rgba(10, 17, 40, 0.95)), url('${coverBase64}');
                    background-size: cover; background-position: center;
                    color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; 
                    text-align: center; page-break-after: always; padding: 60px; box-sizing: border-box; 
                    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
                }
                
                .cover-subtitle { font-family: 'Lato', sans-serif; color: var(--gold); font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 5px; margin-bottom: 30px; }
                .cover-title { font-family: 'Cinzel', serif; font-size: 64px; font-weight: 700; margin: 0 0 40px 0; line-height: 1.1; text-shadow: 2px 2px 20px rgba(0,0,0,0.8); }
                
                .cover-client-box { border-top: 1px solid rgba(197, 160, 89, 0.4); border-bottom: 1px solid rgba(197, 160, 89, 0.4); padding: 25px 0; margin-top: 20px; width: 60%; }
                .cover-client { font-family: 'Lato', sans-serif; font-size: 16px; font-weight: 300; color: #E0E0E0; text-transform: uppercase; letter-spacing: 2px; }
                .cover-client strong { color: var(--gold); font-weight: 700; font-size: 28px; display: block; margin-top: 8px; font-family: 'Cinzel', serif; letter-spacing: 1px;}
                
                .cover-logo { margin-top: auto; font-family: 'Lato', sans-serif; font-size: 12px; color: rgba(255,255,255,0.5); letter-spacing: 4px; text-transform: uppercase; }

                /* CONTEÚDO REFINADO */
                .content-wrapper { padding: 50px 80px; } 
                
                .day-header { page-break-before: always; page-break-inside: avoid; margin-top: 40px; }
                .content-wrapper > .day-header:first-of-type { page-break-before: avoid; margin-top: 0; }
                
                h2 { 
                    font-family: 'Cinzel', serif; color: var(--navy); font-size: 34px; text-align: center; 
                    margin: 0; padding-top: 20px; font-weight: 700;
                }
                /* Linha dupla elegante abaixo do título principal */
                h2::after { 
                    content: ''; display: block; width: 80px; height: 1px; 
                    border-top: 1px solid var(--gold); border-bottom: 1px solid var(--gold); 
                    padding-bottom: 2px; margin: 25px auto 0; 
                }
                
                h3 { 
                    font-family: 'Cinzel', serif; color: var(--gold); font-size: 22px; 
                    margin-top: 40px; margin-bottom: 15px; 
                    border-bottom: 1px solid #EAEAEA; padding-bottom: 10px; font-weight: 700;
                }
                
                p, li { font-size: 15px; color: var(--text); text-align: justify; margin-bottom: 18px; font-weight: 300; }
                a { color: var(--gold); text-decoration: none; font-weight: 700; transition: 0.3s; border-bottom: 1px solid transparent; }
                
                /* IMAGENS FORMATO CINEMA */
                .img-container { width: 100%; text-align: center; margin: 35px 0; }
                .day-image { width: 100%; max-height: 400px; object-fit: cover; border-radius: 4px; box-shadow: 0 15px 35px rgba(10, 17, 40, 0.08); }
                
                /* CITAÇÃO DE REVISTA */
                .quote { 
                    font-family: 'Cinzel', serif; font-style: italic; color: var(--navy); text-align: center; 
                    margin: 50px 0; font-size: 26px; line-height: 1.4; padding: 40px; 
                    background-color: #FFFFFF; border: 1px solid #EAEAEA; box-shadow: 0 10px 30px rgba(0,0,0,0.02);
                }
                .quote strong { font-family: 'Lato', sans-serif; color: var(--gold); display: block; margin-top: 20px; font-size: 13px; text-transform: uppercase; font-style: normal; letter-spacing: 3px; font-weight: 700; }
                
                /* CAIXA DE DICAS ELEGANTES */
                .dica-lucas { 
                    background-color: #FFFFFF; border: 1px solid var(--gold); padding: 35px 40px; 
                    margin: 50px 0; box-shadow: 0 10px 30px rgba(197, 160, 89, 0.05); page-break-inside: avoid;
                    position: relative;
                }
                .dica-lucas strong { font-family: 'Cinzel', serif; color: var(--navy); display: block; margin-bottom: 15px; font-size: 22px; font-weight: 700; }
            </style>
        </head>
        <body>
            <div class="cover">
                <div class="cover-subtitle">Plano de Viagem Exclusivo</div>
                <h1 class="cover-title">A Essência de<br>${destino}</h1>
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
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-web-security',
                '--disable-gpu',
                '--no-zygote',
                '--disable-dev-shm-usage'
            ] 
        });
        const page = await browser.newPage();
        
        await page.setContent(htmlTemplate, { waitUntil: 'load', timeout: 0 });
        
        // Espera as novas fontes Cinzel e Lato (Fontes de Luxo) carregarem
        await page.evaluateHandle('document.fonts.ready');
        await new Promise(r => setTimeout(r, 2500));
        
        const fileName = `roteiro-${Date.now()}.pdf`;
        const filePath = path.join(pdfsDir, fileName);
        
        await page.pdf({ 
            path: filePath, 
            format: 'A4', 
            printBackground: true 
        });
        await browser.close();

        const pdfUrl = `https://${req.get('host')}/pdfs/${fileName}`;
        console.log(`[LOG] SUCESSO! PDF de Luxo gerado: ${pdfUrl}`);
        
        res.json({ pdfUrl });

    } catch (error) {
        console.error('[ERRO FATAL]', error);
        res.status(500).json({ error: 'Falha ao gerar o roteiro' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Robô do Lucas Janone rodando na porta ${PORT}`);
});