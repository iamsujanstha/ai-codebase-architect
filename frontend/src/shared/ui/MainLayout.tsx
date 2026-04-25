import React from 'react';

interface MainLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function MainLayout({ sidebar, children }: MainLayoutProps): JSX.Element {
  return (
    <main className="app-shell">
      <aside className="sidebar-container">
        {sidebar}
      </aside>
      <section className="chat-shell">
        {children}
      </section>
    </main>
  );
}
