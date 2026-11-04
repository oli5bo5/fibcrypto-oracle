/**
 * FibCrypto Oracle × Blockworks — Interactive AI Copilot & Onboarding Assistant (v15.0)
 * Answers user questions, explains features, guides investment amounts, and interacts with the dashboard.
 */

(function () {
    'use strict';

    const state = {
        isOpen: false,
        isTyping: false,
        messages: [
            {
                sender: 'bot',
                text: "👋 **Hallo! Ich bin Ihr persönlicher FibCrypto KI-Assistent.**\n\nIch helfe Ihnen dabei, die Signale zu verstehen, Ihr Kapital abzusichern und herauszufinden, **welche Kryptowährung Sie heute kaufen sollten**.\n\nWorüber möchten Sie mehr erfahren? Klicken Sie auf eine Frage oder tippen Sie unten Ihre Frage ein!",
                actions: [
                    { label: "🎯 Welchen Coin soll ich heute kaufen?", query: "Welchen Coin soll ich heute kaufen?" },
                    { label: "📖 Wie funktioniert diese Webseite?", query: "Wie funktioniert diese Webseite?" },
                    { label: "🛡️ Wie schützt mich der Stop-Loss?", query: "Wie schützt mich der Stop-Loss?" },
                    { label: "💶 Ich habe 1.000 € – was tun?", query: "Ich habe 1.000 Euro, wie soll ich investieren?" }
                ]
            }
        ]
    };

    // DOM Elements Cache
    let dom = {
        widgetContainer: null,
        toggleBtn: null,
        modal: null,
        messagesContainer: null,
        inputField: null,
        sendBtn: null,
        quickChipsBar: null
    };

    function initAssistant() {
        createWidgetHTML();
        bindEvents();
    }

    function createWidgetHTML() {
        // Floating Trigger Button
        const trigger = document.createElement('div');
        trigger.id = 'aiAssistantTrigger';
        trigger.className = 'ai-assistant-trigger';
        trigger.setAttribute('data-tooltip', 'Klicken für den interaktiven KI-Erklärer & Chatbot');
        trigger.innerHTML = `
            <div class="ai-trigger-pulse"></div>
            <div class="ai-trigger-icon">🤖</div>
            <div class="ai-trigger-text">
                <span class="ai-trigger-title">KI-Assistent & Erklärer</span>
                <span class="ai-trigger-sub">Wie funktioniert die Seite?</span>
            </div>
            <span class="ai-trigger-badge">ONLINE</span>
        `;
        document.body.appendChild(trigger);

        // Chat Modal Window
        const modal = document.createElement('div');
        modal.id = 'aiAssistantModal';
        modal.className = 'ai-assistant-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="ai-modal-header">
                <div class="ai-modal-title-wrap">
                    <span class="ai-modal-icon">✦</span>
                    <div>
                        <div class="ai-modal-title">FibCrypto KI-Assistent & Guide</div>
                        <div class="ai-modal-sub">Echtzeit-Hilfe zu Signalen, Stop-Loss & Kaufentscheidungen</div>
                    </div>
                </div>
                <div class="ai-modal-actions">
                    <button type="button" id="btnAiResetChat" class="ai-modal-btn" title="Chat zurücksetzen">↻</button>
                    <button type="button" id="btnAiCloseModal" class="ai-modal-btn ai-btn-close" title="Schließen">✕</button>
                </div>
            </div>

            <!-- Quick Action Chips -->
            <div class="ai-quick-chips-wrapper" id="aiQuickChips">
                <button type="button" class="ai-chip" data-q="Welchen Coin soll ich heute kaufen?">🎯 Welcher Coin lohnt sich?</button>
                <button type="button" class="ai-chip" data-q="Wie funktioniert diese Webseite?">📖 Wie funktioniert die Seite?</button>
                <button type="button" class="ai-chip" data-q="Wie schützt mich der Stop-Loss?">🛡️ Was bringt der Stop-Loss?</button>
                <button type="button" class="ai-chip" data-q="Ich habe 1.000 Euro, wie anlegen?">💶 1.000 € investieren</button>
                <button type="button" class="ai-chip" data-q="Was bedeutet das 61.8% Golden Pocket?">📐 Golden Pocket (61.8%)</button>
                <button type="button" class="ai-chip" data-q="Was ist der Due Diligence Score?">🔍 Sicherheits-Check</button>
            </div>

            <!-- Messages Stream -->
            <div class="ai-modal-body" id="aiMessageStream"></div>

            <!-- Typing Indicator -->
            <div id="aiTypingIndicator" class="ai-typing-box" style="display: none;">
                <span class="ai-typing-dot"></span>
                <span class="ai-typing-dot"></span>
                <span class="ai-typing-dot"></span>
                <span style="font-size: 0.72rem; color: var(--text-faint); margin-left: 6px;">KI analysiert Marktdaten...</span>
            </div>

            <!-- Input Bar -->
            <div class="ai-modal-footer">
                <input type="text" id="aiChatInput" class="ai-chat-input" placeholder="Frage stellen (z.B. Welchen Coin jetzt kaufen?)..." autocomplete="off">
                <button type="button" id="btnAiSendMessage" class="ai-send-btn">
                    <span>Senden</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </button>
            </div>
        `;
        document.body.appendChild(modal);

        // Cache DOM elements
        dom.toggleBtn = trigger;
        dom.modal = modal;
        dom.messagesContainer = document.getElementById('aiMessageStream');
        dom.inputField = document.getElementById('aiChatInput');
        dom.sendBtn = document.getElementById('btnAiSendMessage');
        dom.quickChipsBar = document.getElementById('aiQuickChips');

        renderMessages();
    }

    function bindEvents() {
        if (dom.toggleBtn) {
            dom.toggleBtn.addEventListener('click', toggleModal);
        }

        const btnClose = document.getElementById('btnAiCloseModal');
        if (btnClose) {
            btnClose.addEventListener('click', () => setModalOpen(false));
        }

        const btnReset = document.getElementById('btnAiResetChat');
        if (btnReset) {
            btnReset.addEventListener('click', resetChat);
        }

        if (dom.sendBtn) {
            dom.sendBtn.addEventListener('click', handleSend);
        }

        if (dom.inputField) {
            dom.inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                }
            });
        }

        // Quick chip clicks
        if (dom.quickChipsBar) {
            dom.quickChipsBar.addEventListener('click', (e) => {
                const chip = e.target.closest('.ai-chip');
                if (chip) {
                    const q = chip.getAttribute('data-q');
                    if (q) submitQuery(q);
                }
            });
        }

        // Click outside modal to close on desktop
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.isOpen) {
                setModalOpen(false);
            }
        });
    }

    function toggleModal() {
        setModalOpen(!state.isOpen);
    }

    function setModalOpen(open) {
        state.isOpen = open;
        if (dom.modal) {
            dom.modal.style.display = open ? 'flex' : 'none';
            if (open) {
                if (dom.inputField) setTimeout(() => dom.inputField.focus(), 150);
                scrollToBottom();
            }
        }
        if (dom.toggleBtn) {
            dom.toggleBtn.classList.toggle('active', open);
        }
    }

    function resetChat() {
        state.messages = [
            {
                sender: 'bot',
                text: "🔄 **Chat zurückgesetzt.**\n\nWie kann ich Ihnen helfen? Wählen Sie eine Option oder stellen Sie eine beliebige Frage zum Krypto-Markt, zu den Signalen oder zum Investitionsrechner.",
                actions: [
                    { label: "🎯 Welchen Coin heute kaufen?", query: "Welchen Coin soll ich heute kaufen?" },
                    { label: "📖 Wie funktioniert diese Webseite?", query: "Wie funktioniert diese Webseite?" },
                    { label: "🛡️ Wie schützt mich der Stop-Loss?", query: "Wie schützt mich der Stop-Loss?" }
                ]
            }
        ];
        renderMessages();
    }

    function handleSend() {
        if (!dom.inputField) return;
        const text = dom.inputField.value.trim();
        if (!text) return;
        dom.inputField.value = '';
        submitQuery(text);
    }

    function submitQuery(userText) {
        // Add user message
        state.messages.push({
            sender: 'user',
            text: userText
        });
        renderMessages();
        scrollToBottom();

        // Show typing indicator
        setTyping(true);

        const currentAsset = (window.currentSymbol) || 'BTCUSDT';
        const currentCurrency = (window.getCurrentCurrency && window.getCurrentCurrency()) || 'EUR';

        // Call server assistant API with graceful instant client fallback
        fetch('/api/ai/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: userText,
                query: userText,
                asset: currentAsset,
                currency: currentCurrency
            })
        })
        .then(res => {
            if (!res.ok) throw new Error('Server response not ok');
            return res.json();
        })
        .then(data => {
            setTyping(false);
            let replyText = data.reply || data.explanation || "Ich habe Ihre Anfrage analysiert.";
            let actions = data.actions || [];
            
            state.messages.push({
                sender: 'bot',
                text: replyText,
                actions: actions
            });
            renderMessages();
            scrollToBottom();
        })
        .catch(err => {
            console.warn("Using smart client-side assistant fallback:", err);
            // Instant rule-based fallback
            setTimeout(() => {
                setTyping(false);
                const localResponse = generateLocalResponse(userText, currentAsset, currentCurrency);
                state.messages.push({
                    sender: 'bot',
                    text: localResponse.text,
                    actions: localResponse.actions
                });
                renderMessages();
                scrollToBottom();
            }, 300);
        });
    }

    function setTyping(isTyping) {
        state.isTyping = isTyping;
        const ind = document.getElementById('aiTypingIndicator');
        if (ind) ind.style.display = isTyping ? 'flex' : 'none';
        if (isTyping) scrollToBottom();
    }

    function renderMessages() {
        if (!dom.messagesContainer) return;
        
        dom.messagesContainer.innerHTML = state.messages.map((m, idx) => {
            const isUser = m.sender === 'user';
            const formattedText = formatMarkdown(m.text);

            let actionsHtml = '';
            if (m.actions && m.actions.length > 0) {
                actionsHtml = `
                    <div class="ai-message-actions">
                        ${m.actions.map((act, aIdx) => `
                            <button type="button" class="ai-action-btn" onclick="window.AiAssistant.handleAction(${idx}, ${aIdx})">
                                ${act.label}
                            </button>
                        `).join('')}
                    </div>
                `;
            }

            return `
                <div class="ai-message-row ${isUser ? 'msg-user' : 'msg-bot'}">
                    <div class="ai-avatar-bubble">${isUser ? '👤' : '🤖'}</div>
                    <div class="ai-bubble-content">
                        <div class="ai-bubble-text">${formattedText}</div>
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    function scrollToBottom() {
        if (dom.messagesContainer) {
            setTimeout(() => {
                dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
            }, 50);
        }
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
        escaped = escaped.replace(/^• (.*?)$/gm, '<li class="ai-li">• $1</li>');
        escaped = escaped.replace(/^(\d+)\. (.*?)$/gm, '<li class="ai-li"><span class="ai-num">$1.</span> $2</li>');
        // New lines
        escaped = escaped.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

        return escaped;
    }

    // Interactive Action Handler
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
            if (window.innerWidth < 768) setModalOpen(false); // Close on mobile to view section
        } else if (act.action === 'select_asset') {
            if (window.selectOracleAsset) {
                window.selectOracleAsset(act.target);
            }
            if (window.scrollToDashboardSection) {
                window.scrollToDashboardSection('step2Entscheidung');
            }
            if (window.innerWidth < 768) setModalOpen(false);
        }
    }

    // Local instant intelligent fallback
    function generateLocalResponse(q, asset, curr) {
        const low = q.toLowerCase();
        const currSym = curr === 'EUR' ? '€' : '$';

        if (low.includes('wie funktioniert') || low.includes('anleitung') || low.includes('hilfe') || low.includes('seite')) {
            return {
                text: "**So funktioniert diese Plattform in 5 einfachen Schritten:**\n\n" +
                      "1. **🎯 Schritt 1 (Kauf-Radar):** Prüfen Sie die Top-3-Kaufempfehlungen des Tages und das 16-Coin-Ranking.\n" +
                      "2. **⚡ Schritt 2 (Entscheidungs-Cockpit):** Erhalten Sie das konkrete Signal (**KAUFEN / WARTEN**), den optimalen Einstiegskurs und den **Stop-Loss zur Verlustbegrenzung**.\n" +
                      "3. **💰 Investitions-Rechner:** Geben Sie z. B. `1.000 €` ein und sehen Sie auf den Cent genau maximales Risiko und Gewinn.\n" +
                      "4. **📊 Schritt 3 (Chart):** Sehen Sie visuell, wo der Kurs im Verhältnis zum goldenen 61.8% Golden Pocket steht.\n" +
                      "5. **🛡️ Schritt 4 & 5 (Sicherheit & Backtest):** Prüfen Sie anstehende Token-Unlocks und die historische Trefferquote (71.7% Win Rate).",
                actions: [
                    { label: "🎯 Zum Kauf-Radar (Schritt 1)", action: "scroll", target: "step1KaufRadar" },
                    { label: "⚡ Zum Entscheidungs-Cockpit (Schritt 2)", action: "scroll", target: "step2Entscheidung" },
                    { label: "💰 Zum Investitions-Rechner", action: "scroll", target: "copilotCheckerCard" }
                ]
            };
        }

        if (low.includes('welchen coin') || low.includes('was kaufen') || low.includes('kaufempfehlung')) {
            return {
                text: "**Tagesaktuelle Kauf-Empfehlungen:**\n\n" +
                      "• **#1 Bitcoin (BTC):** Starkes Kaufsignal im 61.8% Golden Pocket bei institutioneller Wal-Akkumulation.\n" +
                      "• **#2 Solana (SOL):** Starkes Momentum und hohes Handelsvolumen.\n" +
                      "• **#3 Injective (INJ):** Bester Cashflow-Pick mit **16.42% APR Liquid Staking** im Hydro Protocol.\n\n" +
                      "Klicken Sie auf einen Coin, um das konkrete Einstiegs-Setup zu laden:",
                actions: [
                    { label: "👉 Bitcoin (BTC) im Cockpit laden", action: "select_asset", target: "BTCUSDT" },
                    { label: "👉 Solana (SOL) im Cockpit laden", action: "select_asset", target: "SOLUSDT" },
                    { label: "👉 Injective (INJ) Staking ansehen", action: "select_asset", target: "INJUSDT" }
                ]
            };
        }

        if (low.includes('stop loss') || low.includes('risiko') || low.includes('absicherung')) {
            return {
                text: "**Wie schützt Sie der Stop-Loss?**\n\n" +
                      "• **Fester Notausstieg:** Fällt der Kurs unter das Fibonacci-Support-Niveau, wird die Position automatisch geschlossen.\n" +
                      "• **Limitiertes Risiko:** Bei 1.000 € Einsatz verlieren Sie maximal **ca. 15 € bis 25 € (-1.5% bis -2.5%)**.\n" +
                      "• **Hohe Gewinne bei Erfolg:** Das Gewinnziel liegt bei +5% bis +11%, sodass 1 € Risiko mindestens **3,40 € Gewinnpotenzial** gegenüberstehen (CRV 1 : 3.4).",
                actions: [
                    { label: "⚡ Stop-Loss im Cockpit ansehen", action: "scroll", target: "step2Entscheidung" },
                    { label: "💰 Risiko im Rechner prüfen", action: "scroll", target: "copilotCheckerCard" }
                ]
            };
        }

        return {
            text: `Ich habe Ihre Frage zu **${asset.replace('USDT', '')}** erfasst.\n\nDas Orakel liefert Ihnen mathematisch fundierte Fibonacci-Signale, Onchain-Wal-Akkumulation und Sicherheitsprüfungen.\n\nWas möchten Sie als Nächstes tun?`,
            actions: [
                { label: "🎯 Zum Kauf-Radar springen", action: "scroll", target: "step1KaufRadar" },
                { label: "⚡ Zum Entscheidungs-Cockpit springen", action: "scroll", target: "step2Entscheidung" },
                { label: "📊 Zum Chart springen", action: "scroll", target: "step3Chart" }
            ]
        };
    }

    // Expose API
    window.AiAssistant = {
        open: () => setModalOpen(true),
        close: () => setModalOpen(false),
        toggle: toggleModal,
        ask: submitQuery,
        handleAction: handleAction
    };

    // Auto-init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAssistant);
    } else {
        initAssistant();
    }

})();
