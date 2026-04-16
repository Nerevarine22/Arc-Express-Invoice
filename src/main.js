import './style.css';
import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers';

const app = document.querySelector('#app');
const STORAGE_KEY = 'arc-express-invoice:my-invoices';
const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_TESTNET_CHAIN_ID_HEX = `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`;
const ARC_TESTNET_PARAMS = {
  chainId: ARC_TESTNET_CHAIN_ID_HEX,
  chainName: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: ['https://rpc.testnet.arc.network'],
  blockExplorerUrls: ['https://testnet.arcscan.app'],
};
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const CONTRACT_ADDRESS = '0x4135f4428ae63264c9a8ca3dd89dED03AC020822';
const USDC_DECIMALS = 6;

const CONTRACT_ABI = [
  'function createInvoice(uint256 amount, string description) external returns (uint256 invoiceId)',
  'function getInvoice(uint256 invoiceId) external view returns (uint256 id, address issuer, uint256 amount, string description, uint8 status, uint256 createdAt, uint256 paidAt, address paidBy)',
  'function payInvoice(uint256 invoiceId) external',
  'function isPaid(uint256 invoiceId) external view returns (bool)',
  'event InvoiceCreated(uint256 indexed invoiceId, address indexed issuer, uint256 amount, string description)',
  'event InvoicePaid(uint256 indexed invoiceId, address indexed paidBy, uint256 paidAt)',
];

const USDC_ABI = [
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
];

const store = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  },
  save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  },
  upsert(item) {
    const items = this.load().filter((entry) => entry.invoiceId !== item.invoiceId);
    items.unshift(item);
    this.save(items);
    return items;
  },
  patch(invoiceId, patch) {
    const items = this.load().map((entry) => (entry.invoiceId === invoiceId ? { ...entry, ...patch } : entry));
    this.save(items);
    return items;
  },
};

app.innerHTML = `
  <div class="page-shell app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">AEI</div>
        <div>
          <div class="brand-title">Arc Express Invoice</div>
          <div class="brand-subtitle">USDC invoicing for Arc Testnet</div>
        </div>
      </div>
      <div class="wallet-card">
        <div class="wallet-meta">
          <span class="network-dot" id="network-dot"></span>
          <div>
            <div class="wallet-title" id="wallet-title">Wallet not connected</div>
            <div class="wallet-subtitle" id="wallet-subtitle">Connect to continue</div>
          </div>
        </div>
        <button class="wallet-btn" id="wallet-button" type="button">Connect wallet</button>
      </div>
    </header>

    <main class="hero">
      <section class="hero-copy card">
        <div class="hero-kicker">Arc Express Invoice</div>
        <div class="hero-layout">
          <div class="hero-text">
            <h1>Create, share, and track invoices.</h1>
            <p class="lede">
              Create a USDC invoice on Arc Testnet, copy a payment link, and track which invoices are pending or paid.
            </p>
            <div class="actions">
              <button class="primary" id="create-tab-button" type="button">Create invoice</button>
              <button class="secondary" id="my-tab-button" type="button">My invoices</button>
            </div>
          </div>
          <div class="hero-metrics" aria-hidden="true">
            <div class="metric">
              <span>Network</span>
              <strong>Arc Testnet</strong>
            </div>
            <div class="metric">
              <span>Payment</span>
              <strong>USDC</strong>
            </div>
            <div class="metric">
              <span>Tracking</span>
              <strong>On-chain status</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="dashboard-grid">
        <article class="card panel" id="create-panel">
          <div class="section-head">
            <div>
              <p class="section-label">Create invoice</p>
              <h2>New invoice</h2>
            </div>
            <span class="status">Draft</span>
          </div>

          <div class="field-group">
            <label>
              USDC amount
              <input id="invoice-amount" value="250.00" />
            </label>
            <label>
              Description
              <textarea id="invoice-description" rows="4">Design sprint invoice for April delivery</textarea>
            </label>
          </div>

          <button class="primary full" id="create-invoice-button" type="button">Generate payment link</button>
          <div class="link-box" id="invoice-result">Your payment link will appear here.</div>
        </article>

        <article class="card panel preview-panel" id="preview-panel">
          <div class="section-head">
            <div>
              <p class="section-label">Live preview</p>
              <h2>Invoice summary</h2>
            </div>
            <span class="status pending">Pending</span>
          </div>

          <div class="invoice-preview">
            <div class="invoice-preview-top">
              <div>
                <strong>Design sprint invoice</strong>
                <p>Arc Testnet</p>
              </div>
              <div class="preview-amount">250.00 USDC</div>
            </div>

            <div class="preview-divider"></div>

            <div class="invoice-preview-list">
              <div class="preview-row">
                <span>Client</span>
                <strong>Saved in browser</strong>
              </div>
              <div class="preview-row">
                <span>Payment link</span>
                <strong>Copy after creation</strong>
              </div>
              <div class="preview-row">
                <span>Status</span>
                <strong>Pending until paid</strong>
              </div>
            </div>
          </div>

          <div class="contract-strip compact">
            <span class="contract-label">Deployed contract</span>
            <code id="contract-address">${CONTRACT_ADDRESS}</code>
          </div>
        </article>
      </section>

      <article class="card panel hidden" id="my-panel">
        <div class="section-head">
          <div>
            <p class="section-label">My invoices</p>
            <h2>Saved invoices</h2>
          </div>
          <span class="status pending" id="my-invoices-count">0 invoices</span>
        </div>
        <p class="muted">These are the invoices created from this browser.</p>
        <div class="invoice-list" id="invoice-list"></div>
      </article>
    </main>
  </div>

  <section class="payment-shell hidden" id="payment-shell">
    <div class="page-shell payment-page-shell">
      <article class="card payment-card">
        <div class="section-head">
          <div>
            <p class="section-label">Pay invoice</p>
            <h2>Invoice payment</h2>
          </div>
          <span class="status pending">Pending</span>
        </div>
        <label>
          Invoice ID
          <input id="lookup-invoice-id" value="1" />
        </label>
        <div class="invoice-view" id="invoice-view">
          <h2>Invoice #1</h2>
          <p class="amount">$0.00 USDC</p>
          <p class="muted">Load an invoice to see details from the contract.</p>
          <div class="paid-banner hidden" id="paid-banner">
            <strong>Payment completed</strong>
            <p>This invoice has already been paid on Arc Testnet.</p>
          </div>
          <div class="detail-grid">
            <div>
              <span class="detail-label">Issuer</span>
              <code id="invoice-issuer">-</code>
            </div>
            <div>
              <span class="detail-label">Status</span>
              <code id="invoice-status">Unknown</code>
            </div>
          </div>
          <button class="primary full" id="pay-invoice-button" type="button">Approve + Pay</button>
          <div class="status-row" id="invoice-status-row">ArcScan link appears after confirmation.</div>
        </div>
      </article>
    </div>
  </section>
`;

const walletButton = document.querySelector('#wallet-button');
const walletTitle = document.querySelector('#wallet-title');
const walletSubtitle = document.querySelector('#wallet-subtitle');
const networkDot = document.querySelector('#network-dot');
const contractAddress = document.querySelector('#contract-address');
const createTabButton = document.querySelector('#create-tab-button');
const myTabButton = document.querySelector('#my-tab-button');
const createPanel = document.querySelector('#create-panel');
const previewPanel = document.querySelector('#preview-panel');
const myPanel = document.querySelector('#my-panel');
const paymentShell = document.querySelector('#payment-shell');
const createInvoiceButton = document.querySelector('#create-invoice-button');
const invoiceAmount = document.querySelector('#invoice-amount');
const invoiceDescription = document.querySelector('#invoice-description');
const invoiceResult = document.querySelector('#invoice-result');
const lookupInvoiceId = document.querySelector('#lookup-invoice-id');
const payInvoiceButton = document.querySelector('#pay-invoice-button');
const invoiceView = document.querySelector('#invoice-view');
const invoiceIssuer = document.querySelector('#invoice-issuer');
const invoiceStatus = document.querySelector('#invoice-status');
const invoiceStatusRow = document.querySelector('#invoice-status-row');
const paidBanner = document.querySelector('#paid-banner');
const invoiceList = document.querySelector('#invoice-list');
const myInvoicesCount = document.querySelector('#my-invoices-count');

const shortAddress = (value) => `${value.slice(0, 6)}...${value.slice(-4)}`;
const shortHash = (value) => `${value.slice(0, 8)}...${value.slice(-6)}`;
let currentInvoiceId = null;
let paymentMode = false;
let lastPaymentLink = '';

const setWalletState = ({ account = '', chainId = '' } = {}) => {
  if (!account) {
    walletTitle.textContent = 'Wallet not connected';
    walletSubtitle.textContent = 'Connect to continue';
    walletButton.textContent = 'Connect wallet';
    walletButton.disabled = false;
    networkDot.className = 'network-dot';
    return;
  }

  walletTitle.textContent = shortAddress(account);
  const onArc = Number(chainId) === ARC_TESTNET_CHAIN_ID;
  walletSubtitle.textContent = onArc ? 'Arc Testnet' : 'Wrong network';
  walletButton.textContent = onArc ? 'Disconnect' : 'Switch network';
  walletButton.disabled = false;
  networkDot.className = onArc ? 'network-dot arc' : 'network-dot wrong';
};

const setTab = (tab) => {
  const isCreate = tab === 'create';
  if (paymentMode) return;
  createPanel.classList.toggle('hidden', !isCreate);
  myPanel.classList.toggle('hidden', isCreate);
  createTabButton.classList.toggle('active-tab', isCreate);
  myTabButton.classList.toggle('active-tab', !isCreate);
};

const showPaymentShell = (show) => {
  paymentMode = show;
  paymentShell.classList.toggle('hidden', !show);
  createPanel.classList.toggle('hidden', show);
  previewPanel.classList.toggle('hidden', show);
  myPanel.classList.toggle('hidden', show);
  createTabButton.classList.toggle('hidden', show);
  myTabButton.classList.toggle('hidden', show);
};

const getCurrentChainId = async () => {
  const hexChainId = await window.ethereum.request({ method: 'eth_chainId' });
  return Number.parseInt(hexChainId, 16);
};

const connectWallet = async () => {
  if (!window.ethereum) {
    walletSubtitle.textContent = 'Install MetaMask to connect';
    return;
  }

  walletButton.disabled = true;
  walletButton.textContent = 'Connecting...';
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const chainId = await getCurrentChainId();
    setWalletState({ account: accounts?.[0] ?? '', chainId });
  } catch (error) {
    console.error('Wallet connection failed:', error);
    walletButton.textContent = 'Connect wallet';
  } finally {
    walletButton.disabled = false;
  }
};

const switchToArcTestnet = async () => {
  if (!window.ethereum) {
    walletSubtitle.textContent = 'Install MetaMask to switch networks';
    return;
  }

  walletButton.disabled = true;
  walletButton.textContent = 'Switching...';
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }],
    });
  } catch (error) {
    if (error?.code === 4902) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [ARC_TESTNET_PARAMS] });
    } else {
      throw error;
    }
  } finally {
    await syncWallet();
    walletButton.disabled = false;
  }
};

const disconnectWallet = () => setWalletState();

const syncWallet = async () => {
  if (!window.ethereum) return;
  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  const chainId = await getCurrentChainId();
  setWalletState({ account: accounts?.[0] ?? '', chainId });
};

const getReadonlyContract = async () => {
  if (!window.ethereum) throw new Error('MetaMask is required');
  const provider = new BrowserProvider(window.ethereum);
  return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
};

const getUsdcContract = async (withSigner = false) => {
  if (!window.ethereum) throw new Error('MetaMask is required');
  const provider = new BrowserProvider(window.ethereum);
  if (withSigner) {
    const signer = await provider.getSigner();
    return new Contract(USDC_ADDRESS, USDC_ABI, signer);
  }
  return new Contract(USDC_ADDRESS, USDC_ABI, provider);
};

const formatStatus = (statusValue) => (Number(statusValue) === 1 ? 'Paid' : 'Pending');

const setPaidUi = (paid) => {
  paidBanner.classList.toggle('hidden', !paid);
  paidBanner.setAttribute('aria-hidden', String(!paid));
  payInvoiceButton.classList.toggle('hidden', paid);
  invoiceStatusRow.classList.toggle('success-row', paid);
  if (paid) {
    invoiceStatusRow.textContent = 'This invoice is already paid.';
  } else {
    invoiceStatusRow.textContent = 'Invoice is pending payment.';
  }
};

const renderInvoiceList = async () => {
  const items = store.load();
  myInvoicesCount.textContent = `${items.length} invoice${items.length === 1 ? '' : 's'}`;

  if (!items.length) {
    invoiceList.innerHTML = '<p class="muted">No invoices yet. Create one on the create tab.</p>';
    return;
  }

  let onchainStatuses = new Map();
  try {
    const contract = await getReadonlyContract();
    const statuses = await Promise.all(
      items.map(async (item) => {
        try {
          const invoice = await contract.getInvoice(item.invoiceId);
          const status = formatStatus(invoice.status);
          const paidAt = Number(invoice.paidAt) ? new Date(Number(invoice.paidAt) * 1000).toLocaleString() : '';
          const paidBy = invoice.paidBy && invoice.paidBy !== '0x0000000000000000000000000000000000000000' ? invoice.paidBy : '';
          store.patch(String(item.invoiceId), { status, paidAt, paidBy });
          return [item.invoiceId, { status, paidAt, paidBy }];
        } catch {
          return [item.invoiceId, { status: item.status, paidAt: item.paidAt || '', paidBy: item.paidBy || '' }];
        }
      }),
    );
    onchainStatuses = new Map(statuses);
  } catch (error) {
    console.error('Could not sync invoice list with contract:', error);
  }

  invoiceList.innerHTML = items
    .map((item) => {
      const entry = onchainStatuses.get(item.invoiceId) || { status: item.status, paidAt: item.paidAt || '', paidBy: item.paidBy || '' };
      const status = entry.status;
      return `
        <article class="invoice-row ${status === 'Paid' ? 'paid' : 'pending'}">
          <div>
            <strong>#${item.invoiceId}</strong>
            <p>${item.description}</p>
            <small>${item.amount} USDC</small>
            ${
              status === 'Paid'
                ? `<div class="invoice-meta">
                    <span>Paid ${entry.paidAt || 'just now'}</span>
                    <span>${entry.paidBy ? shortAddress(entry.paidBy) : ''}</span>
                  </div>`
                : `<div class="invoice-meta">
                    <span>Pending payment</span>
                  </div>`
            }
          </div>
          <div class="invoice-row-meta">
            <span class="chip ${status === 'Paid' ? 'success' : 'ghost'}">${status}</span>
            ${
              status === 'Paid'
                ? `<a class="secondary" href="${item.txHash ? `https://testnet.arcscan.app/tx/${item.txHash}` : 'https://testnet.arcscan.app'}" target="_blank" rel="noreferrer">Explorer</a>`
                : `<button class="secondary copy-payment" data-link="${item.paymentLink || ''}" type="button">Copy link</button>`
            }
          </div>
        </article>
      `;
    })
    .join('');

  document.querySelectorAll('.copy-payment').forEach((button) => {
    button.addEventListener('click', async () => {
      const link = button.getAttribute('data-link');
      if (!link) return;
      navigator.clipboard?.writeText(link).catch(() => {});
      button.textContent = 'Copied';
    });
  });
};

const renderCreatedLink = (url) => {
  invoiceResult.innerHTML = `
    <div class="link-copy" role="button" tabindex="0" data-copy-link="${url}">
      <div class="link-copy-label">Payment link ready</div>
      <code>${url}</code>
      <div class="link-copy-hint">Click to copy</div>
    </div>
  `;

  const copyLink = async () => {
    if (!url) return;
    await navigator.clipboard?.writeText(url).catch(() => {});
    const hint = invoiceResult.querySelector('.link-copy-hint');
    if (hint) {
      const original = hint.textContent;
      hint.textContent = 'Copied';
      window.setTimeout(() => {
        hint.textContent = original || 'Click to copy';
      }, 1200);
    }
  };

  const linkBox = invoiceResult.querySelector('.link-copy');
  linkBox?.addEventListener('click', copyLink);
  linkBox?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      copyLink();
    }
  });
};

const refreshAllowanceState = async (invoiceAmountValue) => {
  if (!window.ethereum || !invoiceAmountValue) return;
  try {
    const usdc = await getUsdcContract(false);
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const owner = await signer.getAddress();
    const allowance = await usdc.allowance(owner, CONTRACT_ADDRESS);
    const needed = parseUnits(String(invoiceAmountValue), USDC_DECIMALS);
    payInvoiceButton.textContent = allowance >= needed ? 'Pay invoice' : 'Approve + Pay';
  } catch (error) {
    console.error('Allowance check failed:', error);
  }
};

const loadInvoice = async (invoiceIdValue) => {
  if (!window.ethereum) {
    invoiceStatusRow.textContent = 'Install MetaMask to load invoice data.';
    return;
  }

  try {
    paidBanner.classList.add('hidden');
    paidBanner.setAttribute('aria-hidden', 'true');
    payInvoiceButton.classList.remove('hidden');
    payInvoiceButton.disabled = true;
    payInvoiceButton.textContent = 'Approve + Pay';
    invoiceStatusRow.classList.remove('success-row');
    invoiceStatusRow.textContent = 'Loading invoice...';
    const contract = await getReadonlyContract();
    const invoice = await contract.getInvoice(invoiceIdValue);

    currentInvoiceId = invoiceIdValue;
    invoiceView.querySelector('h2').textContent = `Invoice #${invoice.id.toString()}`;
    invoiceView.querySelector('.amount').textContent = `${formatUnits(invoice.amount, USDC_DECIMALS)} USDC`;
    invoiceView.querySelector('.muted').textContent = invoice.description;
    invoiceIssuer.textContent = invoice.issuer;
    invoiceStatus.textContent = formatStatus(invoice.status);
    invoiceStatusRow.textContent =
      Number(invoice.status) === 1
        ? `Paid at ${new Date(Number(invoice.paidAt) * 1000).toLocaleString()}`
        : 'Invoice is pending payment.';
    setPaidUi(Number(invoice.status) === 1);
    payInvoiceButton.disabled = Number(invoice.status) === 1;
    payInvoiceButton.textContent = Number(invoice.status) === 1 ? 'Already paid' : 'Approve + Pay';
    await refreshAllowanceState(formatUnits(invoice.amount, USDC_DECIMALS));
  } catch (error) {
    console.error('Load invoice failed:', error);
    currentInvoiceId = null;
    invoiceStatusRow.textContent = `Could not load invoice: ${error?.shortMessage || error?.message || 'unknown error'}`;
    payInvoiceButton.disabled = true;
    setPaidUi(false);
    invoiceStatus.textContent = 'Unknown';
    invoiceIssuer.textContent = '-';
    invoiceView.querySelector('h2').textContent = `Invoice #${invoiceIdValue}`;
    invoiceView.querySelector('.amount').textContent = '$0.00 USDC';
    invoiceView.querySelector('.muted').textContent = 'Load an invoice to see details from the contract.';
  }
};

const openInvoiceFromInput = async () => {
  const invoiceIdValue = lookupInvoiceId.value.trim();
  if (!invoiceIdValue) return;
  showPaymentShell(true);
  await loadInvoice(invoiceIdValue);
};

const approveAllowance = async (invoiceIdValue) => {
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);
  const invoice = await (await getReadonlyContract()).getInvoice(invoiceIdValue);
  const tx = await usdc.approve(CONTRACT_ADDRESS, invoice.amount);
  invoiceStatusRow.textContent = `Approve submitted: ${tx.hash}`;
  await tx.wait();
  await refreshAllowanceState(formatUnits(invoice.amount, USDC_DECIMALS));
  return tx;
};

const payCurrentInvoice = async (invoiceIdValue) => {
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const payerAddress = await signer.getAddress();
  const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const tx = await contract.payInvoice(invoiceIdValue);
  invoiceStatusRow.textContent = `Payment submitted: ${tx.hash}`;
  await tx.wait();
  await loadInvoice(invoiceIdValue);
  setPaidUi(true);
  invoiceStatusRow.innerHTML = `Invoice paid. Tx: <code>${tx.hash}</code><br/><a href="https://testnet.arcscan.app/tx/${tx.hash}" target="_blank" rel="noreferrer">View on ArcScan</a>`;
  return { tx, payerAddress };
};

const openPaymentLink = (invoiceId) => {
  const url = `${window.location.origin}/?invoice=${invoiceId}`;
  lastPaymentLink = url;
  renderCreatedLink(url);
  return url;
};

walletButton.addEventListener('click', async () => {
  if (walletButton.textContent === 'Disconnect') return disconnectWallet();
  if (walletButton.textContent === 'Switch network') {
    try {
      await switchToArcTestnet();
    } catch (error) {
      console.error('Network switch failed:', error);
      walletSubtitle.textContent = 'Could not switch network';
      walletButton.disabled = false;
      walletButton.textContent = 'Switch network';
    }
    return;
  }
  await connectWallet();
});

createTabButton.addEventListener('click', () => {
  setTab('create');
  showPaymentShell(false);
});

myTabButton.addEventListener('click', async () => {
  setTab('my');
  showPaymentShell(false);
  await renderInvoiceList();
});

lookupInvoiceId.addEventListener('change', openInvoiceFromInput);
lookupInvoiceId.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    openInvoiceFromInput();
  }
});

createInvoiceButton.addEventListener('click', async () => {
  if (!window.ethereum) {
    invoiceResult.textContent = 'Install MetaMask to create an invoice.';
    return;
  }

  createInvoiceButton.disabled = true;
  createInvoiceButton.textContent = 'Creating...';

  try {
    const provider = new BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== ARC_TESTNET_CHAIN_ID) {
      invoiceResult.textContent = 'Please switch your wallet to Arc Testnet first.';
      return;
    }

    const signer = await provider.getSigner();
    const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    const amount = parseUnits(String(invoiceAmount.value).trim(), USDC_DECIMALS);
    const description = invoiceDescription.value.trim();
    const tx = await contract.createInvoice(amount, description);
    invoiceResult.textContent = `Transaction submitted: ${tx.hash}`;

    const receipt = await tx.wait();
    const createdEvent = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event) => event && event.name === 'InvoiceCreated');

    const invoiceId = createdEvent ? createdEvent.args.invoiceId.toString() : 'unknown';
    if (invoiceId !== 'unknown') {
      const link = openPaymentLink(invoiceId);
      store.upsert({
        invoiceId,
        amount: formatUnits(amount, USDC_DECIMALS),
        description,
        status: 'Pending',
        paymentLink: link,
      });
      await renderInvoiceList();
    } else {
      invoiceResult.innerHTML = `Invoice created.<br/>Tx: <code>${tx.hash}</code>`;
    }
  } catch (error) {
    console.error('Create invoice failed:', error);
    invoiceResult.textContent = `Could not create invoice: ${error?.shortMessage || error?.message || 'unknown error'}`;
  } finally {
    createInvoiceButton.disabled = false;
    createInvoiceButton.textContent = 'Generate payment link';
  }
});

payInvoiceButton.addEventListener('click', async () => {
  if (!currentInvoiceId) {
    invoiceStatusRow.textContent = 'Load an invoice first.';
    return;
  }
  if (!window.ethereum) {
    invoiceStatusRow.textContent = 'MetaMask is required.';
    return;
  }

  payInvoiceButton.disabled = true;
  payInvoiceButton.textContent = 'Processing...';

  try {
    const provider = new BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== ARC_TESTNET_CHAIN_ID) {
      invoiceStatusRow.textContent = 'Please switch your wallet to Arc Testnet first.';
      return;
    }

    const invoice = await (await getReadonlyContract()).getInvoice(currentInvoiceId);
    const alreadyPaid = Number(invoice.status) === 1;
    if (alreadyPaid) {
      setPaidUi(true);
      invoiceStatusRow.textContent = 'This invoice is already paid.';
      payInvoiceButton.disabled = true;
      return;
    }
    const signer = await provider.getSigner();
    const owner = await signer.getAddress();
    const allowance = await (await getUsdcContract(false)).allowance(owner, CONTRACT_ADDRESS);

    if (allowance < invoice.amount) {
      invoiceStatusRow.textContent = 'Approving USDC...';
      await approveAllowance(currentInvoiceId);
    }

    const { tx, payerAddress } = await payCurrentInvoice(currentInvoiceId);
    const paidAt = new Date().toLocaleString();
    store.patch(String(currentInvoiceId), { status: 'Paid', txHash: tx.hash, paidBy: payerAddress, paidAt });
    await renderInvoiceList();
  } catch (error) {
    console.error('Pay failed:', error);
    invoiceStatusRow.textContent = `Could not update invoice: ${error?.shortMessage || error?.message || 'unknown error'}`;
  } finally {
    payInvoiceButton.disabled = false;
    payInvoiceButton.textContent = 'Approve + Pay';
  }
});

if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', syncWallet);
  window.ethereum.on?.('chainChanged', syncWallet);
  syncWallet();
} else {
  setWalletState();
}

const params = new URLSearchParams(window.location.search);
const invoiceFromUrl = params.get('invoice');
if (invoiceFromUrl) {
  lookupInvoiceId.value = invoiceFromUrl;
  showPaymentShell(true);
  paymentMode = true;
  loadInvoice(invoiceFromUrl);
}

renderInvoiceList();
contractAddress.title = CONTRACT_ADDRESS;
