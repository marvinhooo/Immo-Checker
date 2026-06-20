
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
    <div className={`flex rounded-xl bg-slate-100 p-1 ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 rounded-lg py-2 text-center text-xs font-semibold tracking-wide transition-all duration-200 ${
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
