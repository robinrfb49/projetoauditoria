const express = require('express');
const fs = require('fs');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Restaura o serviço automático de TODAS as páginas da pasta public
app.use(express.static('public')); 

const DB_FILE = './db.json';
const TEAMS_WEBHOOK = 'www.addombosco.com.br'; // Cole aqui a sua URL real do Teams

// ==========================================
// ROTA 1: API do Dashboard (Calcula os KPIs)
// ==========================================
app.get('/api/dashboard', (req, res) => {
    if (!fs.existsSync(DB_FILE)) {
        return res.json({
            resumo_kpis: { total_a_pagar: 0, total_auditado: 0, total_pago: 0, total_recuperado: 0 },
            ultimas_contas: []
        });
    }

    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

        let totalAPagar = 0;
        let totalAuditado = 0;
        let totalPago = 0;
        let totalRecuperado = 0;

        db.forEach(conta => {
            // Conversão forçada para garantir operações matemáticas seguras
            const faturado = parseFloat(conta.valor_faturado) || 0;
            const repasse = parseFloat(conta.valor_repasse) || 0;

            // 1. Soma dos KPIs principais baseada no Status e no valor de Repasse real
            if (conta.status === 'A Pagar') {
                totalAPagar += repasse;
            } else if (conta.status === 'Auditada') {
                totalAuditado += repasse;
            } else if (conta.status === 'Paga') {
                totalPago += repasse;
            }

            // 2. REGRA DE CONCILIAÇÃO: O Total Recuperado é o que o prestador cobrou (Faturado) 
            // menos o que você de fato aceitou liberar (Repasse)
            if (faturado > repasse) {
                totalRecuperado += (faturado - repasse);
            }
        });

        // Retorna os dados com as casas decimais corrigidas para o frontend
        res.json({
            resumo_kpis: {
                total_a_pagar: Number(totalAPagar.toFixed(2)),
                total_auditado: Number(totalAuditado.toFixed(2)),
                total_pago: Number(totalPago.toFixed(2)),
                total_recuperado: Number(totalRecuperado.toFixed(2))
            },
            ultimas_contas: [...db].reverse() // Mostra os lançamentos mais recentes primeiro na tabela
        });

    } catch (err) {
        console.error("Erro ao computar dados do dashboard:", err);
        res.status(500).json({ error: 'Erro interno no servidor Node.js.' });
    }
});

// ==========================================
// ROTA 2: Criar ou Editar Registro
// ==========================================
app.post('/api/salvar-conciliacao', async (req, res) => {
    const registro = req.body;
    let db = [];
    
    if (fs.existsSync(DB_FILE)) {
        try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = []; }
    }

    // Higienização dos dados vindos do formulário para evitar que campos vazios virem NaN
    registro.valor_faturado = parseFloat(registro.valor_faturado) || 0;
    registro.valor_repasse = parseFloat(registro.valor_repasse) || 0;
    registro.valor_auditado = (registro.valor_auditado !== null && registro.valor_auditado !== undefined && registro.valor_auditado !== "") ? parseFloat(registro.valor_auditado) : 0;
    registro.dias_atraso = parseInt(registro.dias_atraso) || 0;

    if (registro.timestamp) {
        // Modo Edição: Localiza pelo timestamp e atualiza a linha correspondente
        const index = db.findIndex(c => c.timestamp === registro.timestamp);
        if (index !== -1) {
            db[index] = registro;
        }
    } else {
        // Modo Novo: Gera um carimbo de data/hora único e adiciona na lista
        registro.timestamp = new Date().toISOString(); 
        db.push(registro);
    }
    
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

    // Integração de notificações com o Microsoft Teams
    try {
        await axios.post(TEAMS_WEBHOOK, {
            text: `**Labdiag - Movimentação Financeira (${registro.timestamp ? 'Editada' : 'Nova'})**\n\n` +
                  `• **Prestador:** ${registro.prestador}\n` +
                  `• **Competência:** ${registro.competencia}\n` +
                  `• **Valor Repasse:** R$ ${registro.valor_repasse.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n` +
                  `• **Status:** ${registro.status}`
        });
    } catch (err) {
        // Falhas de rede ou webhook inválido do Teams não travam a aplicação local
    }

    res.status(200).json({ status: 'Sucesso' });
});

// ==========================================
// ROTA 3: Eliminar Registro permanentemente
// ==========================================
app.delete('/api/contas', (req, res) => {
    const { timestamp } = req.body;
    if (!fs.existsSync(DB_FILE)) return res.status(400).json({ error: 'Ficheiro db.json não encontrado.' });

    try {
        let db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const dbFiltrado = db.filter(c => c.timestamp !== timestamp);
        fs.writeFileSync(DB_FILE, JSON.stringify(dbFiltrado, null, 2));
        res.status(200).json({ status: 'Sucesso' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao eliminar o registro.' });
    }
});

// Substitua o seu app.listen antigo por este bloco completo:
const PORTA = 3000; // Altere para a porta real do seu sistema se não for a 3000

// Faz com que a barra inicial "/" jogue o usuário direto para a tela de login
app.get('/', (req, res) => {
    res.redirect('/login.html');
});
app.listen(PORTA, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(` ✅ SERVIDOR LABDIAG CONECTADO COM SUCESSO!`);
    console.log(` 🏠 Acesse localmente: http://localhost:${PORTA}`);
    console.log(`=================================================`);
});