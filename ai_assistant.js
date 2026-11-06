/**
 * FibCrypto Oracle × Blockworks — AI Analyst FAB & Slide-Over Drawer
 * Specification v15.2.0 (TradingView & Linear Dark Theme Architecture)
 */

(function () {
    'use strict';

    const state = {
        isOpen: false,
        isDocked: false,
        isTyping: false,
        messages: [
            {
                sender: 'bot',
                time: '10:15',
                text: "Hallo! Ich bin dein KI-Markt-Assistent.\nWie kann ich dich bei deiner Trading-Strategie unterstützen?",
                actions: []
            },
            {
                sender: 'user',
                time: '10:15',
                text: "Analysiere bitte den aktuellen Bitcoin-Markt und gib mir meine Einschätzung.",
                actions: []
            },
            {
                sender: 'bot',
                time: '10:16',
                text: "Gerne! Hier ist die aktuelle Analyse von **Bitcoin (BTC / USDT)**: Kurs notiert stabil oberhalb des 61.8% Golden-Pocket-Supports mit positivem Momentum und 12% Kapitalschutz.",
                actions: []
            }
        ]
    };

    let dom = {
        fab: null,
        drawer: null,
        backdrop: null,
        contextChip: null,
        stream: null,
        input: null,
        sendBtn: null,
        quickChips: null,
        typing: null
    };

    function initAssistant() {
        dom.fab = document.getElementById('aiFabBtn');
        dom.drawer = document.getElementById('aiDrawer');
        dom.backdrop = document.getElementById('aiDrawerBackdrop');
        dom.contextChip = document.getElementById('aiDrawerContextChip');
        dom.stream = document.getElementById('aiEmbeddedMessageStream');
        dom.input = document.getElementById('aiEmbeddedChatInput');
        dom.sendBtn = document.getElementById('btnAiEmbeddedSend');
        dom.quickChips = document.getElementById('aiEmbeddedQuickChips');
        dom.typing = document.getElementById('aiEmbeddedTypingIndicator');

        bindEvents();
        renderMessages();
        syncContext();
        setInterval(syncContext, 2000);
    }

    function bindEvents() {
        if (dom.fab) {
            dom.fab.addEventListener('click', toggleDrawer);
        }

        const closeBtn = document.getElementById('btnAiDrawerClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeDrawer);
        }

        const dockBtn = document.getElementById('btnAiDrawerDock');
        if (dockBtn) {
            dockBtn.addEventListener('click', toggleDock);
        }

        if (dom.backdrop) {
            dom.backdrop.addEventListener('click', closeDrawer);
        }

        if (dom.sendBtn) {
            dom.sendBtn.addEventListener('click', handleSend);
        }

        if (dom.input) {
            dom.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                }
            });

            // Auto-resize textarea
            dom.input.addEventListener('input', () => {
                dom.input.style.height = 'auto';
                dom.input.style.height = Math.min(dom.input.scrollHeight, 120) + 'px';
            });
        }

        // Quick prompt chips
        if (dom.quickChips) {
            dom.quickChips.addEventListener('click', (e) => {
                const chip = e.target.closest('.ai-chip');
                if (chip) {
                    const q = chip.getAttribute('data-q');
                    if (q) submitQuery(q);
                }
            });
        }

        // Global Keyboard Shortcut: Cmd + K or Ctrl + K
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                toggleDrawer();
            } else if (e.key === 'Escape' && state.isOpen) {
                closeDrawer();
            }
        });
    }

    function toggleDrawer() {
        if (state.isOpen) closeDrawer();
        else openDrawer();
    }

    function openDrawer() {
        state.isOpen = true;
        if (dom.drawer) dom.drawer.classList.add('open');
        if (dom.backdrop && !state.isDocked) dom.backdrop.classList.add('active');
        syncContext();
        if (dom.input) {
            setTimeout(() => dom.input.focus(), 250);
        }
        scrollToBottom();
    }

    function closeDrawer() {
        state.isOpen = false;
        if (dom.drawer) dom.drawer.classList.remove('open');
        if (dom.backdrop) dom.backdrop.classList.remove('active');
    }

    function toggleDock() {
        state.isDocked = !state.isDocked;
        const main = document.querySelector('.terminal-main-container') || document.getElementById('oracleView');
        if (dom.drawer) dom.drawer.classList.toggle('docked', state.isDocked);
        if (main) main.classList.toggle('drawer-docked', state.isDocked);
        if (dom.backdrop) dom.backdrop.classList.toggle('active', !state.isDocked && state.isOpen);
    }

    function syncContext() {
        const symEl = document.getElementById('bannerSymbol');
        const priceEl = document.getElementById('livePrice');
        const sym = symEl ? symEl.textContent.trim() : (window.currentSymbol || 'BTC/USDT');
        const price = priceEl ? priceEl.textContent.trim() : '';

        if (dom.contextChip) {
            dom.contextChip.textContent = `[Context: ${sym} @ ${price || 'Live'}]`;
        }

        if (dom.input && !dom.input.value) {
            dom.input.placeholder = `Frage stellen zu ${sym} oder Strategie (Enter zum Senden)...`;
        }

        // Also update Hero Stat Card
        syncHeroStatCard();
    }

    function syncHeroStatCard() {
        const elAction = document.getElementById('heroTopPickAction');
        const elSub = document.getElementById('heroTopPickSub');
        const elRisk = document.getElementById('heroTopPickRisk');
        if (!elAction) return;

        const activeBadge = document.getElementById('oracleSignalText') || document.getElementById('oracleSignalBadge');
        const activeSignal = activeBadge ? activeBadge.textContent.trim().toUpperCase() : 'KAUFEN';
        const crvBadge = document.getElementById('crvBadge');
        const crvText = crvBadge ? crvBadge.textContent.replace('CRV:', '').trim() : '1:3.40';
        const activeSym = (window.currentSymbol || 'BTCUSDT').replace('USDT', '');

        elAction.textContent = activeSignal.includes('KAUF') ? 'KAUFEN' : (activeSignal.includes('VERKAUF') ? 'VERKAUFEN' : 'WARTEN');
        if (elSub) elSub.textContent = `${activeSym}USDT • CRV ${crvText} • GOLDEN POCKET 61.8%`;
        if (elRisk) elRisk.textContent = '12 %';
    }

    function handleSend() {
        if (!dom.input) return;
        const text = dom.input.value.trim();
        if (!text) return;
        dom.input.value = '';
        dom.input.style.height = 'auto';
        submitQuery(text);
    }

    async function submitQuery(queryText) {
        if (!queryText || state.isTyping) return;

        // Add user message
        state.messages.push({
            sender: 'user',
            text: queryText
        });
        renderMessages();
        scrollToBottom();

        // Show typing indicator
        state.isTyping = true;
        if (dom.typing) dom.typing.style.display = 'flex';

        const sym = (window.currentSymbol || 'BTCUSDT');
        const curr = window.currentCurrency || 'USD';

        // Simulate short analytical delay for realism
        setTimeout(() => {
            const reply = generateLocalResponse(queryText, sym, curr);
            state.messages.push({
                sender: 'bot',
                text: reply.text,
                actions: reply.actions || []
            });

            state.isTyping = false;
            if (dom.typing) dom.typing.style.display = 'none';
            renderMessages();
            scrollToBottom();
        }, 450);
    }

    function renderMessages() {
        if (!dom.stream) return;

        const botSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="3"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 15h.01M16 15h.01M9 19h6"/></svg>';
        const userSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

        const html = state.messages.map((msg, msgIdx) => {
            const isUser = msg.sender === 'user';
            const formattedText = formatMarkdown(msg.text);
            const timeStr = msg.time || new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

            let actionsHtml = '';
            if (msg.actions && msg.actions.length > 0) {
                actionsHtml = `
                    <div class="ai-bubble-actions">
                        ${msg.actions.map((act, actIdx) => `
                            <button type="button" class="ai-action-btn" onclick="window.AiAssistant.handleAction(${msgIdx}, ${actIdx})">
                                ${act.label}
                            </button>
                        `).join('')}
                    </div>
                `;
            }

            return `
                <div class="ai-message-row ${isUser ? 'msg-user' : 'msg-bot'}">
                    <div class="ai-avatar-bubble">${isUser ? userSvg : botSvg}</div>
                    <div class="ai-bubble-content">
                        <div class="ai-bubble-text">${formattedText}</div>
                        <div class="ai-bubble-time">${isUser ? '•••' : timeStr}</div>
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }).join('');

        dom.stream.innerHTML = html;
    }

    function scrollToBottom() {
        if (!dom.stream) return;
        setTimeout(() => {
            dom.stream.scrollTop = dom.stream.scrollHeight;
        }, 40);
    }

    function formatMarkdown(raw) {
        if (!raw) return '';
        let escaped = raw
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Bold
        escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic
        escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Bullet points
        escaped = escaped.replace(/^• (.*?)$/gm, '<div style="margin-left: 8px;">• $1</div>');
        escaped = escaped.replace(/^(\d+)\. (.*?)$/gm, '<div style="margin-left: 8px;"><strong>$1.</strong> $2</div>');
        // New lines
        escaped = escaped.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

        return escaped;
    }

    function handleAction(msgIdx, actIdx) {
        const msg = state.messages[msgIdx];
        if (!msg || !msg.actions) return;
        const act = msg.actions[actIdx];
        if (!act) return;

        if (act.query) {
            submitQuery(act.query);
            return;
        }

        if (act.action === 'scroll') {
            if (window.scrollToDashboardSection) {
                window.scrollToDashboardSection(act.target);
            } else {
                const el = document.getElementById(act.target);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (window.innerWidth < 768) closeDrawer();
        } else if (act.action === 'select_asset') {
            if (window.selectOracleAsset) {
                window.selectOracleAsset(act.target);
            }
            if (window.scrollToDashboardSection) {
                window.scrollToDashboardSection('step2Entscheidung');
            }
            if (window.innerWidth < 768) closeDrawer();
        }
    }

    function generateLocalResponse(q, asset, curr) {
        const low = q.toLowerCase();
        const short = asset.replace('USDT', '');
        const currSym = curr === 'EUR' ? '€' : '$';

        if (low.includes('golden pocket') || low.includes('61.8') || low.includes('fibonacci')) {
            return {
                text: `**Golden Pocket Analyse für ${short}:**\n\nDas 61.8% Fibonacci-Retracement gilt als die stärkste statistische Rebound-Zone im Markt.\n\n• **Bedeutung:** Wenn institutionelle Käufer auf diesem Level akkumulieren, ist das Risiko minimal.\n• **Einstieg:** Platzieren Sie Limit-Käufe leicht oberhalb der 61.8%-Marke.\n• **Schutz:** Der Stop-Loss gehört zwingend knapp unter das 78.6%-Level.`,
                actions: [
                    { label: "📊 Im Chart ansehen", action: "scroll", target: "step3Chart" },
                    { label: "⚡ Preis-Levels im Cockpit", action: "scroll", target: "step2Entscheidung" }
                ]
            };
        }

        if (low.includes('stop-loss') || low.includes('verlust') || low.includes('risiko') || low.includes('schutz')) {
            return {
                text: `**Risikomanagement & Stop-Loss für ${short}:**\n\n• **Feste Regel:** Riskieren Sie pro Trade maximal **1% bis 2% Ihres Gesamtkapitals**.\n• **Konkreter Stop-Loss:** Liegt für ${short} knapp unter dem letzten Swing-Tief, um Fehlausbrüche zu vermeiden.\n• **CRV-Vorteil:** Durch das berechnete CRV von über **1:3.0** reicht bereits eine Trefferquote von 40%, um profitabel zu sein.`,
                actions: [
                    { label: "💰 Im Risiko-Rechner durchrechnen", action: "scroll", target: "copilotCheckerCard" },
                    { label: "🛑 Stop-Loss im Cockpit prüfen", action: "scroll", target: "step2Entscheidung" }
                ]
            };
        }

        if (low.includes('crv') || low.includes('chance') || low.includes('verhältnis')) {
            return {
                text: `**Chance-Risiko-Verhältnis (CRV) für ${short}:**\n\n• **Aktuelles CRV:** ca. **1 : 3.40**\n• **Was bedeutet das?** Für jeden investierten Euro Verlustrisiko bei Stop-Loss stehen **3,40 Euro realistischer Gewinn** beim Take-Profit gegenüber.\n• **Regel:** Setups unter einem CRV von 1:1.5 werden vom Orakel automatisch als Neutral/Warten eingestuft.`,
                actions: [
                    { label: "⚡ Trading-Plan prüfen", action: "scroll", target: "step2Entscheidung" }
                ]
            };
        }

        if (low.includes('kaufen') || low.includes('welchen coin') || low.includes('setup')) {
            return {
                text: `**Kaufempfehlung heute für ${short}:**\n\n1. **Kauf-Radar:** ${short} zeigt aktuell ein überzeugendes Signal mit gesunder Konsolidierung an der Fibonacci-Unterstützung.\n2. **Vorgehensweise:** Staffeln Sie Ihren Einstieg (50% jetzt, 50% bei direktem Retest).\n3. **Gewinnmitnahme:** 50% Teilgewinn bei Take-Profit 1, Rest trailing mit Stop-Loss auf Break-Even.`,
                actions: [
                    { label: "🎯 Zum Kauf-Radar springen", action: "scroll", target: "step1KaufRadar" },
                    { label: "⚡ Einstiegsmarke laden", action: "scroll", target: "step2Entscheidung" }
                ]
            };
        }

        return {
            text: `Ich habe Ihre Frage zu **${short}** analysiert.\n\nDas Orakel liefert Ihnen mathematisch fundierte Fibonacci-Signale, Onchain-Wal-Akkumulation und automatische Risikoberechnung.\n\nWas möchten Sie als Nächstes tun?`,
            actions: [
                { label: "⚡ Zum Entscheidungs-Cockpit", action: "scroll", target: "step2Entscheidung" },
                { label: "📊 Zum Chart", action: "scroll", target: "step3Chart" },
                { label: "💰 Zum Risiko-Rechner", action: "scroll", target: "copilotCheckerCard" }
            ]
        };
    }

    function discussCurrentAsset() {
        const sym = (window.currentSymbol || 'BTCUSDT').replace('USDT', '');
        openDrawer();
        submitQuery(`Analysiere das aktuelle Trading-Setup für ${sym} mit konkreten Einstiegs-, Stop-Loss- und Take-Profit-Marken.`);
    }

    // Expose API
    window.AiAssistant = {
        open: openDrawer,
        close: closeDrawer,
        toggle: toggleDrawer,
        discussCurrentAsset: discussCurrentAsset,
        ask: submitQuery,
        handleAction: handleAction
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAssistant);
    } else {
        initAssistant();
    }

})();

/* Preis-Leiter: positioniert Stop-Loss / Entry / Ziele auf einer horizontalen Skala */
window.updatePriceLadder = function (sl, entry, tp1, tp2) {
    const vals = [sl, entry, tp1, tp2].map(Number);
    if (vals.some(v => !isFinite(v) || v <= 0)) return;
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const pos = v => 4 + ((v - min) / span) * 92; // 4% .. 96%
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.style.left = pos(v) + '%'; };
    set('plDotSl', sl); set('plDotEntry', entry); set('plDotTp1', tp1); set('plDotTp2', tp2);
    const seg = (id, a, b) => {
        const el = document.getElementById(id);
        if (!el) return;
        const l = Math.min(pos(a), pos(b)), r = Math.max(pos(a), pos(b));
        el.style.left = l + '%'; el.style.width = (r - l) + '%';
    };
    seg('plSegRisk', sl, entry);
    seg('plSegReward', entry, tp2);
};
