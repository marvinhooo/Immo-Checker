
interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: ReadonlyArray<Tab>;
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  className = '',
}: TabsProps) {
  return (
    <div className={`flex rounded-xl bg-slate-100 p-1 overflow-x-auto scrollbar-none ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`shrink-0 rounded-lg py-2 px-3 text-center text-xs font-semibold tracking-wide transition-all duration-200 whitespace-nowrap ${
              isActive
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
