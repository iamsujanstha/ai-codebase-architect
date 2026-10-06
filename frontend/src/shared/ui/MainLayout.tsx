import { useState, type ReactNode } from 'react';

interface MainLayoutProps { sidebar: ReactNode; children: ReactNode; }

export function MainLayout({ sidebar, children }: MainLayoutProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <main className="app-shell">
      <a className="skip-link" href="#chat-prompt">Skip to message</a>
      <div className="mobile-bar">
        <span className="mobile-brand">Architect</span>
        <button className="secondary-button" aria-expanded={sidebarOpen} aria-controls="workspace-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? 'Close sidebar' : 'Conversations & models'}
        </button>
      </div>
      <aside id="workspace-sidebar" className={`sidebar-container ${sidebarOpen ? 'is-open' : ''}`}>{sidebar}</aside>
      <section className="chat-shell">{children}</section>
    </main>
  );
}
