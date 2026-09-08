const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  vault: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  create: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  recovery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  chain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/><path d="M13 11h3v3"/></svg>',
  voting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M7 17v-4M12 17v-8M17 17V7"/></svg>',
  supply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 3h3l2.5 13H20l2-7H7"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="20" r="2"/></svg>',
  documents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg>',
  notify: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  blockchain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5V21h-6v-6h-6v6H3z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>',
};

const NAV = [
  { section: "CORE" },
  { href: "dashboard.html", label: "Dashboard", icon: "dashboard" },
  { href: "create-vault.html", label: "Create Vault", icon: "create" },
  { href: "vaults.html", label: "My Vaults", icon: "vault" },
  { href: "recovery.html", label: "Recovery", icon: "recovery" },

  { section: "SECURITY" },
  { href: "blockchain.html", label: "Blockchain Audit", icon: "blockchain", tag: "SIM" },
  { href: "notifications.html", label: "Notifications", icon: "notify" },

  { section: "DEMONSTRATIONS" },
  { href: "ethereum.html", label: "Ethereum", icon: "external", tag: "DEMO" },
  { href: "fabric.html", label: "Hyperledger Fabric", icon: "chain", tag: "DEMO" },
  { href: "voting.html", label: "Voting", icon: "voting", tag: "DEMO" },
  { href: "supply-chain.html", label: "Supply Chain", icon: "supply", tag: "DEMO" },
  { href: "documents.html", label: "Document Verification", icon: "documents", tag: "DEMO" },
];

export function renderShell(activePage) {
  const inject = document.getElementById("shell-slots");
  if (!inject) return;

  const currentPage = activePage || (window.location.pathname.split("/").pop() || "dashboard.html");

  let navHtml = "";
  NAV.forEach((item) => {
    if (item.section) {
      navHtml += `<div class="nav-section">${item.section}</div>`;
    } else {
      const active = currentPage === item.href ? "active" : "";
      const tag = item.tag ? `<span class="nav-tag">${item.tag}</span>` : "";
      navHtml += `<a href="${item.href}" class="${active}">${ICONS[item.icon]}<span>${item.label}</span>${tag}</a>`;
    }
  });

  const userBlock =
    '<div class="sidebar-user" id="sidebar-user"></div>';

  const shell = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Ephemeral Vault
        </div>
        <div class="sidebar-role-line">Secret Recovery Platform</div>
        <nav>${navHtml}</nav>
        <div class="nav-section">ACCOUNT</div>
        <a href="profile.html" class="${currentPage === "profile.html" ? "active" : ""}">${ICONS.profile}<span>Profile</span></a>
        <a href="login.html" id="sign-out-link">${ICONS.shield}<span>Sign out</span></a>
        ${userBlock}
      </aside>
      <main class="main" id="main-column">
        ${inject.innerHTML}
      </main>
    </div>
  `;

  inject.innerHTML = shell;

  const signOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    try { fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    window.location.href = 'login.html';
  };
  const signOutLink = inject.querySelector('#sign-out-link');
  if (signOutLink) {
    signOutLink.addEventListener('click', (e) => { e.preventDefault(); signOut(); });
  }

  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    const box = document.getElementById('sidebar-user');
    if (u && box) {
      const roleLabel = (u.role || 'OWNER').toLowerCase().replace('_', ' ');
      box.innerHTML =
        '<div class="user-avatar">' + (u.name || '?')[0].toUpperCase() + '</div>' +
        '<div class="user-meta">' +
        '<div class="user-name">' + u.name + '</div>' +
        '<div class="user-role">' + roleLabel + '</div>' +
        '</div>';
    }
  } catch (e) {}
}