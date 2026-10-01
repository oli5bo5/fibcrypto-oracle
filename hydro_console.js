/**
 * Hydro Protocol & ECC Agent Console
 * Injective Network (CosmWasm + Cosmos SDK)
 * Target Chain: injective-1 mainnet / injective-888 testnet
 * Core Tokens: INJ (native), hINJ (liquid derivative), HDRO (governance)
 */

(function () {
    'use strict';

    // --- Protocol Configuration & Constants ---
    const HYDRO_CONFIG = {
        EXCHANGE_RATE: 1.0542, // 1 hINJ ≈ 1.0542 INJ
        STAKING_APR: 16.42,
        HDRO_APR: 24.85,
        FARM_APY: 28.60,
        UNBONDING_DAYS: 21,
        INSTANT_FEE_PCT: 0.5,
        CONTRACT_CORE: "inj1qg4w07d4uv0k9g79y40k9qwrw3j6y2uv8k6kma",
        CONTRACT_FARM: "inj18g3x86uclvzg68w2n9qwp4x7w2dcv4y9k0e7a2",
        CONTRACT_HDRO: "inj17a022ff11d4k9g79y40k9qwrw3j6y2uv8k6kmf"
    };

    // --- Initial Wallets ---
    const WALLETS = {
        keplr: {
            id: "keplr",
            name: "Keplr Wallet",
            address: "inj1keplr97z02r8f8r3uux2q7yvw74qf63u9g460a8",
            type: "Browser Extension",
            inj: 145.50,
            hinj: 32.40,
            hdro: 620.00,
            stakedFarm: 15.00,
            stakedHdro: 200.00
        },
        leap: {
            id: "leap",
            name: "Leap Cosmos",
            address: "inj1leap34d8a1x99z2km75wqu8v5756jlaq0m8y24c",
            type: "Cosmos Extension",
            inj: 82.20,
            hinj: 10.00,
            hdro: 150.00,
            stakedFarm: 0.00,
            stakedHdro: 50.00
        },
        agent: {
            id: "agent",
            name: "ECC Agent Harness",
            address: "inj1agent007x9427389cbmzqwe10023hydro847291a",
            type: "Autonomous Worker",
            inj: 520.00,
            hinj: 180.25,
            hdro: 4120.00,
            stakedFarm: 100.00,
            stakedHdro: 1500.00
        }
    };

    // --- Default CosmWasm ExecuteMsg Templates ---
    const TEMPLATES = {
        stake: JSON.stringify({ stake: {} }, null, 2),
        unstake: JSON.stringify({ unstake: { amount: "10000000000000000000" } }, null, 2),
        instant_burn_swap: JSON.stringify({ instant_burn_swap: { amount: "5000000000000000000", min_received: "5244000000000000000" } }, null, 2),
        auto_compound: JSON.stringify({ auto_compound: {} }, null, 2),
        deposit_farm: JSON.stringify({ deposit_to_farm: { pool_id: 1, amount: "5000000000000000000" } }, null, 2),
        claim_rewards: JSON.stringify({ claim_farm_rewards: { pool_id: 1 } }, null, 2),
        withdraw_unbonded: JSON.stringify({ withdraw_unbonded: {} }, null, 2)
    };

    // --- State Variables ---
    let activeWalletKey = 'keplr';
    let currentHydroTab = 'stake'; // 'stake', 'vaults', 'ecc_agent', 'playground', 'explorer'
    let stakeMode = 'stake'; // 'stake' or 'unstake'
    let unstakeType = 'delayed'; // 'delayed' (21 days) or 'instant' (0.5% fee)
    
    // Autopilot State
    let agentActive = false;
    let agentIntervalSec = 4;
    let agentIntervalTimer = null;
    let agentCompoundedTotal = 0.00;
    let agentGasTotal = 0;
    let agentHeartbeatsCount = 0;

    // Unbonding Queue
    let unbondingQueue = [
        {
            id: "unb-092",
            amountHinj: 5.0,
            injExpected: 5.27,
            startTime: Date.now() - 1000 * 60 * 60 * 24 * 14,
            completionTime: Date.now() + 1000 * 60 * 18,
            matured: false
        }
    ];

    // Transactions Log
    let transactions = [
        {
            hash: "0x6f12a819b9de...c421",
            method: "AutoCompound",
            sender: WALLETS.agent.address,
            gasUsed: "142,320 ugás",
            status: "SUCCESS",
            time: new Date(Date.now() - 1000 * 60 * 5).toLocaleTimeString('de-DE'),
            events: ["wasm-auto_compound: rewards_reinvested = 4.24 INJ"]
        },
        {
            hash: "0x3b892a71fe99...a810",
            method: "Stake",
            sender: WALLETS.keplr.address,
            gasUsed: "94,180 ugás",
            status: "SUCCESS",
            time: new Date(Date.now() - 1000 * 60 * 42).toLocaleTimeString('de-DE'),
            events: ["minted 32.40 hINJ", "staked 34.15 INJ"]
        }
    ];

    // Agent Telemetry Logs
    let agentLogs = [
        `[${new Date().toLocaleTimeString('de-DE')}] [SIM] Hydro CosmWasm Simulator Initialized (injective-888 testnet / sandbox harness).`,
        `[${new Date().toLocaleTimeString('de-DE')}] [SPEC] Hydro Protocol LSD Core v2 specification verified. Testnet state ready.`,
        `[${new Date().toLocaleTimeString('de-DE')}] [STATUS] Engine standby. Ready for safe simulated CosmWasm execution.`
    ];

    // --- DOM Elements Cache ---
    let dom = {};

    function initDOM() {
        dom = {
            // Main views
            oracleView: document.getElementById('oracleView'),
            hydroView: document.getElementById('hydroView'),
            tabOracleBtn: document.getElementById('tabOracleBtn'),
            tabHydroBtn: document.getElementById('tabHydroBtn'),

            // Wallet Selector
            walletSelect: document.getElementById('hydroWalletSelect'),
            activeAddressEl: document.getElementById('hydroActiveAddress'),
            walletInjBalEl: document.getElementById('hydroWalletInjBal'),
            walletHinjBalEl: document.getElementById('hydroWalletHinjBal'),
            walletHdroBalEl: document.getElementById('hydroWalletHdroBal'),
            walletFarmBalEl: document.getElementById('hydroWalletFarmBal'),
            walletStakedHdroEl: document.getElementById('hydroWalletStakedHdro'),

            // Hydro sub-tabs
            hydroTabBtns: document.querySelectorAll('.hydro-tab-btn'),
            hydroTabContents: document.querySelectorAll('.hydro-tab-content'),

            // Staking Tab
            stakeModeStakeBtn: document.getElementById('hydroStakeModeStake'),
            stakeModeUnstakeBtn: document.getElementById('hydroStakeModeUnstake'),
            unstakeTypeRow: document.getElementById('hydroUnstakeTypeRow'),
            unstakeTypeDelayedBtn: document.getElementById('hydroUnstakeTypeDelayed'),
            unstakeTypeInstantBtn: document.getElementById('hydroUnstakeTypeInstant'),
            stakeAmountInput: document.getElementById('hydroStakeAmountInput'),
            stakeBalanceLabel: document.getElementById('hydroStakeBalanceLabel'),
            stakeEstOutput: document.getElementById('hydroStakeEstOutput'),
            stakeOutputLabel: document.getElementById('hydroStakeOutputLabel'),
            stakeActionBtn: document.getElementById('hydroStakeActionBtn'),
            btnMaxStake: document.getElementById('hydroBtnMaxStake'),
            unbondingQueueList: document.getElementById('hydroUnbondingQueueList'),

            // LSDFi Vaults Tab
            vaultFarmDeposited: document.getElementById('vaultFarmDeposited'),
            vaultFarmRewards: document.getElementById('vaultFarmRewards'),
            vaultHdroDeposited: document.getElementById('vaultHdroDeposited'),
            vaultHdroRewards: document.getElementById('vaultHdroRewards'),
            btnFarmDeposit: document.getElementById('btnFarmDeposit'),
            btnFarmClaim: document.getElementById('btnFarmClaim'),
            btnHdroStake: document.getElementById('btnHdroStake'),
            btnHdroClaim: document.getElementById('btnHdroClaim'),

            // ECC Agent Tab
            autopilotToggleBtn: document.getElementById('hydroAutopilotToggleBtn'),
            autopilotStatusBadge: document.getElementById('hydroAutopilotStatusBadge'),
            autopilotStatusText: document.getElementById('hydroAutopilotStatusText'),
            agentIntervalBtns: document.querySelectorAll('.agent-interval-btn'),
            agentCompoundedTotalEl: document.getElementById('agentCompoundedTotal'),
            agentGasTotalEl: document.getElementById('agentGasTotal'),
            agentHeartbeatsCountEl: document.getElementById('agentHeartbeatsCount'),
            telemetryConsole: document.getElementById('hydroTelemetryLogs'),
            btnClearLogs: document.getElementById('btnClearLogs'),

            // Playground Tab
            wasmContractInput: document.getElementById('wasmContractInput'),
            wasmMsgTextarea: document.getElementById('wasmMsgTextarea'),
            wasmJsonError: document.getElementById('wasmJsonError'),
            wasmBroadcastBtn: document.getElementById('wasmBroadcastBtn'),
            wasmExecOutput: document.getElementById('wasmExecOutput'),
            wasmTemplateBtns: document.querySelectorAll('.wasm-template-btn'),

            // Explorer Tab
            explorerTableBody: document.getElementById('hydroExplorerTableBody'),
            explorerTxCount: document.getElementById('hydroExplorerTxCount')
        };
    }

    // --- Top-Level View Switcher ---
    function switchMainView(view) {
        if (!dom.oracleView || !dom.hydroView) return;

        if (view === 'hydro') {
            dom.oracleView.style.display = 'none';
            dom.hydroView.style.display = 'block';
            if (dom.tabOracleBtn) dom.tabOracleBtn.classList.remove('active');
            if (dom.tabHydroBtn) dom.tabHydroBtn.classList.add('active');
            renderAllHydro();
        } else {
            dom.hydroView.style.display = 'none';
            dom.oracleView.style.display = 'block';
            if (dom.tabHydroBtn) dom.tabHydroBtn.classList.remove('active');
            if (dom.tabOracleBtn) dom.tabOracleBtn.classList.add('active');
            // Trigger chart redraw in oracle if candles exist
            if (window.renderCharts) {
                window.renderCharts();
            }
        }
    }

    // --- Sub-Tab Switcher ---
    function switchHydroTab(tabId) {
        currentHydroTab = tabId;
        if (dom.hydroTabBtns) {
            dom.hydroTabBtns.forEach(btn => {
                if (btn.getAttribute('data-tab') === tabId) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        if (dom.hydroTabContents) {
            dom.hydroTabContents.forEach(content => {
                if (content.id === `hydroTab_${tabId}`) {
                    content.style.display = 'block';
                } else {
                    content.style.display = 'none';
                }
            });
        }
    }

    // --- Wallet Management ---
    function getActiveWallet() {
        return WALLETS[activeWalletKey] || WALLETS.keplr;
    }

    function selectWallet(walletKey) {
        if (!WALLETS[walletKey]) return;
        activeWalletKey = walletKey;
        if (dom.walletSelect && dom.walletSelect.value !== walletKey) {
            dom.walletSelect.value = walletKey;
        }
        updateWalletUI();
        updateStakeInputs();
        showToast(`Wallet gewechselt: ${getActiveWallet().name}`);
    }

    function updateWalletUI() {
        const w = getActiveWallet();
        if (dom.activeAddressEl) dom.activeAddressEl.textContent = w.address;
        if (dom.walletInjBalEl) dom.walletInjBalEl.textContent = `${w.inj.toFixed(2)} INJ`;
        if (dom.walletHinjBalEl) dom.walletHinjBalEl.textContent = `${w.hinj.toFixed(2)} hINJ`;
        if (dom.walletHdroBalEl) dom.walletHdroBalEl.textContent = `${w.hdro.toFixed(2)} HDRO`;
        if (dom.walletFarmBalEl) dom.walletFarmBalEl.textContent = `${w.stakedFarm.toFixed(2)} hINJ`;
        if (dom.walletStakedHdroEl) dom.walletStakedHdroEl.textContent = `${w.stakedHdro.toFixed(2)} HDRO`;

        // Update Vault tab balances
        if (dom.vaultFarmDeposited) dom.vaultFarmDeposited.textContent = `${w.stakedFarm.toFixed(2)} hINJ`;
        if (dom.vaultHdroDeposited) dom.vaultHdroDeposited.textContent = `${w.stakedHdro.toFixed(2)} HDRO`;
    }

    // --- Staking Logic ---
    function setStakeMode(mode) {
        stakeMode = mode;
        if (dom.stakeModeStakeBtn && dom.stakeModeUnstakeBtn) {
            if (mode === 'stake') {
                dom.stakeModeStakeBtn.classList.add('active');
                dom.stakeModeUnstakeBtn.classList.remove('active');
                if (dom.unstakeTypeRow) dom.unstakeTypeRow.style.display = 'none';
                if (dom.stakeActionBtn) dom.stakeActionBtn.textContent = 'INJ Staken (Mint hINJ)';
            } else {
                dom.stakeModeUnstakeBtn.classList.add('active');
                dom.stakeModeStakeBtn.classList.remove('active');
                if (dom.unstakeTypeRow) dom.unstakeTypeRow.style.display = 'flex';
                updateUnstakeActionLabel();
            }
        }
        updateStakeInputs();
    }

    function setUnstakeType(type) {
        unstakeType = type;
        if (dom.unstakeTypeDelayedBtn && dom.unstakeTypeInstantBtn) {
            if (type === 'delayed') {
                dom.unstakeTypeDelayedBtn.classList.add('active');
                dom.unstakeTypeInstantBtn.classList.remove('active');
            } else {
                dom.unstakeTypeInstantBtn.classList.add('active');
                dom.unstakeTypeDelayedBtn.classList.remove('active');
            }
        }
        updateUnstakeActionLabel();
        calcEstOutput();
    }

    function updateUnstakeActionLabel() {
        if (!dom.stakeActionBtn) return;
        if (unstakeType === 'instant') {
            dom.stakeActionBtn.textContent = 'Sofort-Swap ausführen (0.5% AMM Fee)';
        } else {
            dom.stakeActionBtn.textContent = 'Unbonding einleiten (21 Tage Standard)';
        }
    }

    function updateStakeInputs() {
        const w = getActiveWallet();
        if (dom.stakeBalanceLabel) {
            if (stakeMode === 'stake') {
                dom.stakeBalanceLabel.textContent = `Verfügbar: ${w.inj.toFixed(4)} INJ`;
                if (dom.stakeOutputLabel) dom.stakeOutputLabel.textContent = 'Geschätzter Erhalt (hINJ):';
            } else {
                dom.stakeBalanceLabel.textContent = `Verfügbar: ${w.hinj.toFixed(4)} hINJ`;
                if (dom.stakeOutputLabel) dom.stakeOutputLabel.textContent = 'Geschätzter Erhalt (INJ):';
            }
        }
        calcEstOutput();
    }

    function calcEstOutput() {
        if (!dom.stakeAmountInput || !dom.stakeEstOutput) return;
        const val = parseFloat(dom.stakeAmountInput.value) || 0;
        if (val <= 0) {
            dom.stakeEstOutput.textContent = '0.0000';
            return;
        }

        if (stakeMode === 'stake') {
            const outHinj = val / HYDRO_CONFIG.EXCHANGE_RATE;
            dom.stakeEstOutput.textContent = `${outHinj.toFixed(4)} hINJ`;
        } else {
            if (unstakeType === 'instant') {
                const grossInj = val * HYDRO_CONFIG.EXCHANGE_RATE;
                const netInj = grossInj * (1 - HYDRO_CONFIG.INSTANT_FEE_PCT / 100);
                dom.stakeEstOutput.textContent = `${netInj.toFixed(4)} INJ (inkl. 0.5% Fee)`;
            } else {
                const expectedInj = val * HYDRO_CONFIG.EXCHANGE_RATE;
                dom.stakeEstOutput.textContent = `${expectedInj.toFixed(4)} INJ (21 Tage)`;
            }
        }
    }

    function handleStakeAction() {
        const w = getActiveWallet();
        const val = parseFloat(dom.stakeAmountInput ? dom.stakeAmountInput.value : 0);

        if (!val || val <= 0) {
            showToast('Bitte einen gültigen Betrag eingeben.', 'error');
            return;
        }

        if (stakeMode === 'stake') {
            if (val > w.inj) {
                showToast(`Unzureichendes Guthaben: Sie haben nur ${w.inj.toFixed(2)} INJ.`, 'error');
                return;
            }

            setButtonLoading(dom.stakeActionBtn, true, 'Signiere Transaktion...');
            setTimeout(() => {
                const receivedHinj = parseFloat((val / HYDRO_CONFIG.EXCHANGE_RATE).toFixed(4));
                w.inj = parseFloat((w.inj - val).toFixed(4));
                w.hinj = parseFloat((w.hinj + receivedHinj).toFixed(4));

                const tx = {
                    hash: generateTxHash('inj'),
                    method: "Stake",
                    sender: w.address,
                    gasUsed: `${Math.floor(92000 + Math.random() * 8000)} ugás`,
                    status: "SUCCESS",
                    time: new Date().toLocaleTimeString('de-DE'),
                    events: [`minted ${receivedHinj} hINJ`, `staked ${val} INJ`]
                };
                recordTransaction(tx);

                setButtonLoading(dom.stakeActionBtn, false, 'INJ Staken (Mint hINJ)');
                if (dom.stakeAmountInput) dom.stakeAmountInput.value = '';
                updateWalletUI();
                updateStakeInputs();
                showToast(`Erfolgreich gestaked! +${receivedHinj} hINJ erhalten.`);
            }, 800);

        } else {
            // Unstake
            if (val > w.hinj) {
                showToast(`Unzureichendes hINJ-Guthaben: Sie haben nur ${w.hinj.toFixed(2)} hINJ.`, 'error');
                return;
            }

            setButtonLoading(dom.stakeActionBtn, true, 'Übermittle Unbonding...');
            setTimeout(() => {
                if (unstakeType === 'instant') {
                    const grossInj = val * HYDRO_CONFIG.EXCHANGE_RATE;
                    const netInj = parseFloat((grossInj * 0.995).toFixed(4));
                    w.hinj = parseFloat((w.hinj - val).toFixed(4));
                    w.inj = parseFloat((w.inj + netInj).toFixed(4));

                    const tx = {
                        hash: generateTxHash('swap'),
                        method: "InstantBurnSwap",
                        sender: w.address,
                        gasUsed: `${Math.floor(118000 + Math.random() * 12000)} ugás`,
                        status: "SUCCESS",
                        time: new Date().toLocaleTimeString('de-DE'),
                        events: [`swapped ${val} hINJ -> ${netInj} INJ (0.5% fee applied)`]
                    };
                    recordTransaction(tx);
                    showToast(`Sofort-Swap ausgeführt! +${netInj} INJ gutgeschrieben.`);
                } else {
                    const expectedInj = parseFloat((val * HYDRO_CONFIG.EXCHANGE_RATE).toFixed(4));
                    w.hinj = parseFloat((w.hinj - val).toFixed(4));

                    const newUnbondItem = {
                        id: `unb-${Math.floor(100 + Math.random() * 900)}`,
                        amountHinj: val,
                        injExpected: expectedInj,
                        startTime: Date.now(),
                        completionTime: Date.now() + 1000 * 60 * 21, // 21 minutes for demo representation
                        matured: false
                    };
                    unbondingQueue.unshift(newUnbondItem);

                    const tx = {
                        hash: generateTxHash('unb'),
                        method: "Unstake",
                        sender: w.address,
                        gasUsed: `${Math.floor(98000 + Math.random() * 6000)} ugás`,
                        status: "SUCCESS",
                        time: new Date().toLocaleTimeString('de-DE'),
                        events: [`queued ${val} hINJ for 21-day unbonding -> expected: ${expectedInj} INJ`]
                    };
                    recordTransaction(tx);
                    renderUnbondingQueue();
                    showToast(`Unbonding eingeleitet! ${val} hINJ in Warteschlange gestellt.`);
                }

                setButtonLoading(dom.stakeActionBtn, false, unstakeType === 'instant' ? 'Sofort-Swap ausführen (0.5% AMM Fee)' : 'Unbonding einleiten (21 Tage Standard)');
                if (dom.stakeAmountInput) dom.stakeAmountInput.value = '';
                updateWalletUI();
                updateStakeInputs();
            }, 800);
        }
    }

    function renderUnbondingQueue() {
        if (!dom.unbondingQueueList) return;
        if (unbondingQueue.length === 0) {
            dom.unbondingQueueList.innerHTML = `<div style="text-align:center; padding: 1.5rem; color: var(--text-faint); font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">Keine aktiven Unbonding-Anfragen vorhanden.</div>`;
            return;
        }

        dom.unbondingQueueList.innerHTML = unbondingQueue.map(item => {
            const isMatured = Date.now() >= item.completionTime || item.matured;
            const remainingMin = Math.max(0, Math.ceil((item.completionTime - Date.now()) / (1000 * 60)));
            const totalDurationMs = 21 * 60 * 1000;
            const elapsedMs = Math.max(0, totalDurationMs - (item.completionTime - Date.now()));
            const progressPct = isMatured ? 100 : Math.min(99, Math.max(5, Math.round((elapsedMs / totalDurationMs) * 100)));

            return `
                <div class="unbond-item ${isMatured ? 'matured' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span class="unbond-id">${item.id}</span>
                        <span class="unbond-status ${isMatured ? 'status-ready' : 'status-pending'}">
                            ${isMatured ? 'Ausreife erreicht (Mittel bereit)' : `In Bearbeitung (~${remainingMin} Min. verbleibend)`}
                        </span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; margin-bottom: 8px;">
                        <span style="color: var(--text-muted);">${item.amountHinj.toFixed(2)} hINJ abgezogen</span>
                        <span style="color: var(--accent-green); font-weight: 700;">+${item.injExpected.toFixed(2)} INJ fällig</span>
                    </div>
                    ${isMatured ? `
                        <button class="btn-claim-unbond" onclick="window.HydroApp.claimUnbonded('${item.id}')">
                            Mittel jetzt abheben (WithdrawUnbonded)
                        </button>
                    ` : `
                        <div class="unbond-progress"><div class="unbond-bar" style="width: ${progressPct}%;"></div></div>
                        <div style="font-size: 0.72rem; color: var(--text-faint); margin-top: 4px;">Demomodus: Standard 21-Tage-Unbonding auf 21 Minuten zur interaktiven Verifikation beschleunigt (${progressPct}% abgeschlossen)</div>
                    `}
                </div>
            `;
        }).join('');
    }

    function claimUnbonded(id) {
        const idx = unbondingQueue.findIndex(u => u.id === id);
        if (idx === -1) return;
        const item = unbondingQueue[idx];
        const w = getActiveWallet();

        w.inj = parseFloat((w.inj + item.injExpected).toFixed(4));
        unbondingQueue.splice(idx, 1);

        const tx = {
            hash: generateTxHash('claim'),
            method: "WithdrawUnbonded",
            sender: w.address,
            gasUsed: "88,240 ugás",
            status: "SUCCESS",
            time: new Date().toLocaleTimeString('de-DE'),
            events: [`released ${item.injExpected.toFixed(2)} INJ to ${w.address}`]
        };
        recordTransaction(tx);
        renderUnbondingQueue();
        updateWalletUI();
        updateStakeInputs();
        showToast(`Freigegebene Mittel erfolgreich abgehoben! +${item.injExpected.toFixed(2)} INJ gutgeschrieben.`);
    }

    // --- LSDFi Vaults & Farming Actions ---
    function handleFarmDeposit() {
        const w = getActiveWallet();
        if (w.hinj < 5) {
            showToast('Mindestens 5.0 hINJ für den Farm-Vault erforderlich.', 'error');
            return;
        }
        w.hinj = parseFloat((w.hinj - 5).toFixed(4));
        w.stakedFarm = parseFloat((w.stakedFarm + 5).toFixed(4));

        const tx = {
            hash: generateTxHash('farm'),
            method: "DepositToFarm",
            sender: w.address,
            gasUsed: "124,190 ugás",
            status: "SUCCESS",
            time: new Date().toLocaleTimeString('de-DE'),
            events: ["deposit_to_farm: pool_id=1, amount=5 hINJ"]
        };
        recordTransaction(tx);
        updateWalletUI();
        updateStakeInputs();
        showToast('5.0 hINJ erfolgreich in Pool #1 eingezahlt (28.60% APY)!');
    }

    function handleFarmClaim() {
        const w = getActiveWallet();
        const earned = 2.45;
        w.hdro = parseFloat((w.hdro + earned).toFixed(2));

        const tx = {
            hash: generateTxHash('claim'),
            method: "ClaimFarmRewards",
            sender: w.address,
            gasUsed: "98,340 ugás",
            status: "SUCCESS",
            time: new Date().toLocaleTimeString('de-DE'),
            events: [`claim_farm_rewards: pool_id=1, rewards=${earned} HDRO`]
        };
        recordTransaction(tx);
        updateWalletUI();
        showToast(`Farm-Prämien erfolgreich beansprucht! +${earned} HDRO erhalten.`);
    }

    function handleHdroStake() {
        const w = getActiveWallet();
        if (w.hdro < 50) {
            showToast('Mindestens 50 HDRO für Governance-Staking erforderlich.', 'error');
            return;
        }
        w.hdro = parseFloat((w.hdro - 50).toFixed(2));
        w.stakedHdro = parseFloat((w.stakedHdro + 50).toFixed(2));

        const tx = {
            hash: generateTxHash('gov'),
            method: "StakeHdro",
            sender: w.address,
            gasUsed: "91,100 ugás",
            status: "SUCCESS",
            time: new Date().toLocaleTimeString('de-DE'),
            events: ["staked 50 HDRO in Revenue-Share Vault"]
        };
        recordTransaction(tx);
        updateWalletUI();
        showToast('50 HDRO gestaked (24.85% APR & Revenue Share aktiv)!');
    }

    function handleHdroClaim() {
        const w = getActiveWallet();
        const rev = 0.84;
        w.inj = parseFloat((w.inj + rev).toFixed(4));

        const tx = {
            hash: generateTxHash('rev'),
            method: "ClaimRevenueShare",
            sender: w.address,
            gasUsed: "95,400 ugás",
            status: "SUCCESS",
            time: new Date().toLocaleTimeString('de-DE'),
            events: [`claimed ${rev} INJ protocol revenue share`]
        };
        recordTransaction(tx);
        updateWalletUI();
        showToast(`Protokoll-Umsatzbeteiligung abgeholt! +${rev} INJ gutgeschrieben.`);
    }

    // --- ECC Agent Autopilot ---
    function toggleAutopilot() {
        agentActive = !agentActive;
        if (agentActive) {
            agentIntervalTimer = setInterval(runAgentStep, agentIntervalSec * 1000);
            if (dom.autopilotToggleBtn) {
                dom.autopilotToggleBtn.textContent = 'Autopilot stoppen';
                dom.autopilotToggleBtn.classList.add('btn-stop');
            }
            if (dom.autopilotStatusBadge) {
                dom.autopilotStatusBadge.className = 'status-badge-running';
                dom.autopilotStatusText.textContent = 'AUTOPILOT AKTIV (AUTONOMOUS YIELD HARVESTER)';
            }
            appendAgentLog(`[SYS] Autopilot gestartet mit Intervall: ${agentIntervalSec}s.`);
            showToast('ECC Agent Autopilot gestartet!');
        } else {
            if (agentIntervalTimer) clearInterval(agentIntervalTimer);
            if (dom.autopilotToggleBtn) {
                dom.autopilotToggleBtn.textContent = 'Autopilot starten';
                dom.autopilotToggleBtn.classList.remove('btn-stop');
            }
            if (dom.autopilotStatusBadge) {
                dom.autopilotStatusBadge.className = 'status-badge-idle';
                dom.autopilotStatusText.textContent = 'STANDBY / IDLE';
            }
            appendAgentLog(`[SYS] Autopilot angehalten.`);
            showToast('ECC Agent Autopilot angehalten.');
        }
    }

    function runAgentStep() {
        const timeStr = new Date().toLocaleTimeString('de-DE');
        agentHeartbeatsCount++;
        const gasThisStep = Math.floor(105000 + Math.random() * 32000);
        agentGasTotal += gasThisStep;

        const rand = Math.random();
        if (rand < 0.6) {
            // AutoCompound Action
            const rewardHarvested = parseFloat((Math.random() * 0.4 + 0.12).toFixed(4));
            agentCompoundedTotal = parseFloat((agentCompoundedTotal + rewardHarvested).toFixed(4));

            WALLETS.agent.hinj = parseFloat((WALLETS.agent.hinj + rewardHarvested).toFixed(4));
            WALLETS.agent.hdro = parseFloat((WALLETS.agent.hdro + 1.25).toFixed(2));

            const tx = {
                hash: generateTxHash('ecc'),
                method: "AutoCompound",
                sender: WALLETS.agent.address,
                gasUsed: `${gasThisStep.toLocaleString('en-US')} ugás`,
                status: "SUCCESS",
                time: timeStr,
                events: [`wasm-autocompound: compounded=${rewardHarvested} INJ`, `minted hINJ to pool reserves`]
            };
            recordTransaction(tx);
            appendAgentLog(`[${timeStr}] [ECC-EXEC] Triggered AutoCompound() -> Reinvested ${rewardHarvested} INJ.`);
        } else {
            // Query & State Verification
            appendAgentLog(`[${timeStr}] [ECC-QUERY] Heartbeat #${agentHeartbeatsCount}: Injective CosmWasm RPC state OK. Slippage < 0.05%. Yield spread 4.12%.`);
        }

        updateAgentMetricsUI();
        if (activeWalletKey === 'agent') {
            updateWalletUI();
        }
    }

    function updateAgentMetricsUI() {
        if (dom.agentCompoundedTotalEl) dom.agentCompoundedTotalEl.textContent = `${agentCompoundedTotal.toFixed(4)} INJ`;
        if (dom.agentGasTotalEl) dom.agentGasTotalEl.textContent = `${agentGasTotal.toLocaleString('en-US')} ugás`;
        if (dom.agentHeartbeatsCountEl) dom.agentHeartbeatsCountEl.textContent = agentHeartbeatsCount.toString();
    }

    function appendAgentLog(logText) {
        agentLogs.unshift(logText);
        if (agentLogs.length > 50) agentLogs.pop();
        if (dom.telemetryConsole) {
            dom.telemetryConsole.innerHTML = agentLogs.map(l => {
                let color = 'var(--text-body)';
                if (l.includes('[ECC-EXEC]')) color = 'var(--accent-green)';
                else if (l.includes('[ECC-QUERY]')) color = 'var(--accent-cyan)';
                else if (l.includes('[SYS]')) color = 'var(--accent-orange)';
                return `<div class="terminal-line" style="color: ${color};">${escapeHtml(l)}</div>`;
            }).join('');
        }
    }

    // --- CosmWasm ExecuteMsg Playground ---
    function selectTemplate(templateKey) {
        if (!TEMPLATES[templateKey]) return;
        if (dom.wasmMsgTextarea) {
            dom.wasmMsgTextarea.value = TEMPLATES[templateKey];
        }
        if (dom.wasmJsonError) dom.wasmJsonError.style.display = 'none';
        if (dom.wasmTemplateBtns) {
            dom.wasmTemplateBtns.forEach(btn => {
                if (btn.getAttribute('data-tpl') === templateKey) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    }

    function handleBroadcastMsg() {
        if (!dom.wasmMsgTextarea) return;
        const rawJson = dom.wasmMsgTextarea.value.trim();

        try {
            const parsed = JSON.parse(rawJson);
            if (dom.wasmJsonError) dom.wasmJsonError.style.display = 'none';

            const rootKey = Object.keys(parsed)[0] || "CustomMsg";
            const w = getActiveWallet();
            const contractAddr = dom.wasmContractInput ? dom.wasmContractInput.value.trim() : HYDRO_CONFIG.CONTRACT_CORE;

            setButtonLoading(dom.wasmBroadcastBtn, true, 'Signiere CosmWasm Tx...');
            setTimeout(() => {
                const txHash = generateTxHash('wasm');
                const gas = `${Math.floor(102000 + Math.random() * 22000)} ugás`;

                const tx = {
                    hash: txHash,
                    method: rootKey,
                    sender: w.address,
                    gasUsed: gas,
                    status: "SUCCESS",
                    time: new Date().toLocaleTimeString('de-DE'),
                    events: [`wasm-exec: action=${rootKey}`, `contract=${contractAddr}`]
                };
                recordTransaction(tx);

                if (dom.wasmExecOutput) {
                    dom.wasmExecOutput.textContent = JSON.stringify({
                        broadcast_result: "success",
                        txhash: txHash,
                        height: 7421809,
                        gas_wanted: "150000",
                        gas_used: gas,
                        contract: contractAddr,
                        sender: w.address,
                        action: rootKey,
                        events: tx.events
                    }, null, 2);
                }

                setButtonLoading(dom.wasmBroadcastBtn, false, 'CosmWasm Nachricht signieren & broadcasten');
                appendAgentLog(`[${new Date().toLocaleTimeString('de-DE')}] [WASM-EXEC] Broadcasted ${rootKey} via ${w.address}. Tx: ${txHash}`);
                showToast(`CosmWasm Nachricht '${rootKey}' erfolgreich gebroadcastet!`);
            }, 600);

        } catch (e) {
            if (dom.wasmJsonError) {
                dom.wasmJsonError.style.display = 'block';
                dom.wasmJsonError.textContent = `JSON-Syntaxfehler: ${e.message}`;
            }
        }
    }

    // --- On-Chain Explorer ---
    function recordTransaction(tx) {
        transactions.unshift(tx);
        if (transactions.length > 30) transactions.pop();
        renderExplorerTable();
    }

    function renderExplorerTable() {
        if (!dom.explorerTableBody) return;
        if (dom.explorerTxCount) dom.explorerTxCount.textContent = `${transactions.length} Transaktionen`;

        dom.explorerTableBody.innerHTML = transactions.map(tx => `
            <tr>
                <td style="font-family: 'JetBrains Mono', monospace; color: var(--accent-cyan); font-weight: 600;">
                    ${tx.hash}
                </td>
                <td>
                    <span class="method-badge method-${tx.method.toLowerCase()}">${tx.method}</span>
                </td>
                <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-faint);">
                    ${truncateAddr(tx.sender)}
                </td>
                <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">
                    ${tx.gasUsed}
                </td>
                <td>
                    <span class="badge-win">${tx.status}</span>
                </td>
                <td style="font-size: 0.78rem; font-family: 'JetBrains Mono', monospace; color: var(--text-muted);">
                    ${tx.events.join(' • ')}
                </td>
                <td style="font-size: 0.75rem; font-family: 'JetBrains Mono', monospace; color: var(--text-faint);">
                    ${tx.time}
                </td>
            </tr>
        `).join('');
    }

    // --- Helper Functions ---
    function generateTxHash() {
        const hexChars = '0123456789ABCDEF';
        let hash = '';
        for (let i = 0; i < 64; i++) {
            hash += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
        }
        return hash;
    }

    function truncateAddr(addr) {
        if (!addr || addr.length < 16) return addr;
        return addr.substring(0, 10) + '...' + addr.substring(addr.length - 6);
    }

    function setButtonLoading(btn, isLoading, text) {
        if (!btn) return;
        btn.disabled = isLoading;
        btn.textContent = text;
        if (isLoading) {
            btn.classList.add('loading');
        } else {
            btn.classList.remove('loading');
        }
    }

    function showToast(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        if (type === 'error') {
            toast.style.borderColor = 'var(--accent-red)';
            toast.style.color = '#ff6e6e';
            toast.style.boxShadow = '0 8px 30px rgba(255, 77, 77, 0.25)';
        }
        toast.innerHTML = `<div>${escapeHtml(msg)}</div>`;
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3800);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderAllHydro() {
        updateWalletUI();
        updateStakeInputs();
        renderUnbondingQueue();
        updateAgentMetricsUI();
        appendAgentLog(`[STATUS] Hydro Console Active. Wallet: ${getActiveWallet().name}`);
        renderExplorerTable();
    }

    // --- Setup Event Listeners ---
    function setupEventListeners() {
        // Navigation Tabs (Oracle vs Hydro)
        if (dom.tabOracleBtn) {
            dom.tabOracleBtn.addEventListener('click', () => switchMainView('oracle'));
        }
        if (dom.tabHydroBtn) {
            dom.tabHydroBtn.addEventListener('click', () => switchMainView('hydro'));
        }

        // Sub-tabs in Hydro
        if (dom.hydroTabBtns) {
            dom.hydroTabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabId = btn.getAttribute('data-tab');
                    switchHydroTab(tabId);
                });
            });
        }

        // Wallet Select
        if (dom.walletSelect) {
            dom.walletSelect.addEventListener('change', (e) => {
                selectWallet(e.target.value);
            });
        }

        // Staking Mode Switchers
        if (dom.stakeModeStakeBtn) {
            dom.stakeModeStakeBtn.addEventListener('click', () => setStakeMode('stake'));
        }
        if (dom.stakeModeUnstakeBtn) {
            dom.stakeModeUnstakeBtn.addEventListener('click', () => setStakeMode('unstake'));
        }
        if (dom.unstakeTypeDelayedBtn) {
            dom.unstakeTypeDelayedBtn.addEventListener('click', () => setUnstakeType('delayed'));
        }
        if (dom.unstakeTypeInstantBtn) {
            dom.unstakeTypeInstantBtn.addEventListener('click', () => setUnstakeType('instant'));
        }

        // Stake Input Listeners
        if (dom.stakeAmountInput) {
            dom.stakeAmountInput.addEventListener('input', calcEstOutput);
        }
        if (dom.btnMaxStake) {
            dom.btnMaxStake.addEventListener('click', () => {
                const w = getActiveWallet();
                if (dom.stakeAmountInput) {
                    dom.stakeAmountInput.value = (stakeMode === 'stake' ? w.inj : w.hinj).toFixed(4);
                    calcEstOutput();
                }
            });
        }
        if (dom.stakeActionBtn) {
            dom.stakeActionBtn.addEventListener('click', handleStakeAction);
        }

        // LSDFi Vaults
        if (dom.btnFarmDeposit) dom.btnFarmDeposit.addEventListener('click', handleFarmDeposit);
        if (dom.btnFarmClaim) dom.btnFarmClaim.addEventListener('click', handleFarmClaim);
        if (dom.btnHdroStake) dom.btnHdroStake.addEventListener('click', handleHdroStake);
        if (dom.btnHdroClaim) dom.btnHdroClaim.addEventListener('click', handleHdroClaim);

        // Autopilot
        if (dom.autopilotToggleBtn) {
            dom.autopilotToggleBtn.addEventListener('click', toggleAutopilot);
        }
        if (dom.agentIntervalBtns) {
            dom.agentIntervalBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    dom.agentIntervalBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    agentIntervalSec = parseInt(btn.getAttribute('data-sec')) || 4;
                    if (agentActive) {
                        clearInterval(agentIntervalTimer);
                        agentIntervalTimer = setInterval(runAgentStep, agentIntervalSec * 1000);
                    }
                    showToast(`Takt-Intervall angepasst auf ${agentIntervalSec}s`);
                });
            });
        }
        if (dom.btnClearLogs) {
            dom.btnClearLogs.addEventListener('click', () => {
                agentLogs = [`[${new Date().toLocaleTimeString('de-DE')}] [SYS] Logs cleared by operator.`];
                appendAgentLog(`[STATUS] Console ready.`);
            });
        }

        // Playground Templates & Broadcast
        if (dom.wasmTemplateBtns) {
            dom.wasmTemplateBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    selectTemplate(btn.getAttribute('data-tpl'));
                });
            });
        }
        if (dom.wasmBroadcastBtn) {
            dom.wasmBroadcastBtn.addEventListener('click', handleBroadcastMsg);
        }
    }

    // --- Initialization on DOM Ready ---
    document.addEventListener('DOMContentLoaded', () => {
        initDOM();
        setupEventListeners();
        selectTemplate('stake');
        renderAllHydro();
    });

    // Expose public API on window for cross-module calls (e.g. from Oracle)
    window.HydroApp = {
        switchMainView,
        switchHydroTab,
        selectWallet,
        claimUnbonded,
        openStakingForInj: function () {
            switchMainView('hydro');
            switchHydroTab('stake');
            setStakeMode('stake');
        }
    };

})();
