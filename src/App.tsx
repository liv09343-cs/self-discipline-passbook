import { useState } from 'react';
import type { TabKey } from './types';
import { useApp } from './store/AppStore';
import { PassbookShell } from './components/PassbookShell';
import { TimerPage } from './components/TimerPage';
import { LedgerPage } from './components/LedgerPage';
import { RewardsPage } from './components/RewardsPage';
import { CalendarPage } from './components/CalendarPage';
import { StatsPage } from './components/StatsPage';
import { PassbookCover } from './components/PassbookCover';
import { ToastStack, useToasts } from './components/Toast';
import { useSupabaseAutoSync } from './hooks/useSupabaseSync';
import { useDeadlineNotifications } from './hooks/useDeadlineNotifications';

const TAB_KEYS: TabKey[] = ['timer', 'ledger', 'rewards', 'calendar', 'stats'];

function readTabFromHash(): TabKey {
  if (typeof window === 'undefined') return 'timer';
  const value = window.location.hash.replace(/^#/, '');
  return (TAB_KEYS as string[]).includes(value) ? (value as TabKey) : 'timer';
}

export default function App() {
  const { state } = useApp();
  useSupabaseAutoSync();
  useDeadlineNotifications(state.books);
  const [tab, setTab] = useState<TabKey>(readTabFromHash);
  const [showCover, setShowCover] = useState(true);
  const { items, push } = useToasts();

  const changeTab = (next: TabKey) => {
    setTab(next);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${next}`);
    }
  };

  if (showCover) {
    return (
      <>
        <PassbookCover onOpen={() => setShowCover(false)} />
        <ToastStack items={items} />
      </>
    );
  }

  return (
    <>
      <PassbookShell
        tab={tab}
        onTabChange={changeTab}
        onShowCover={() => setShowCover(true)}
        toast={push}
      >
        {tab === 'timer' && (
          <TimerPage toast={push} onGoCalendar={() => changeTab('calendar')} />
        )}
        {tab === 'ledger' && <LedgerPage toast={push} />}
        {tab === 'rewards' && <RewardsPage toast={push} />}
        {tab === 'calendar' && <CalendarPage toast={push} />}
        {tab === 'stats' && <StatsPage />}
      </PassbookShell>
      <ToastStack items={items} />
    </>
  );
}