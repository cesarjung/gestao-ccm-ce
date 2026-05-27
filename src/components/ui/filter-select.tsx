import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Filter } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const FilterSelect = ({
  label,
  options,
  selectedValues,
  onChange,
  searchable = false
}: {
  label: string;
  options: { value: string | number; label: string }[];
  selectedValues: any[];
  onChange: (val: any[]) => void;
  searchable?: boolean;
}) => {
  const [search, setSearch] = useState("");
  
  const filteredOptions = searchable && search 
    ? options.filter(o => String(o.label).toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="flex flex-col justify-center min-w-[90px]">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between text-left font-normal text-[11px] h-8 bg-background">
            <span className="truncate">{selectedValues.length === 0 ? 'Todos' : `${selectedValues.length} selec.`}</span>
            <Filter className="w-3 h-3 ml-2 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 max-h-[500px] overflow-y-auto z-[9999]" align="start">
          <div className="p-2 border-b border-border flex flex-col gap-2 sticky top-0 bg-popover z-10">
            {searchable && (
              <input 
                type="text" 
                placeholder="Pesquisar..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
                className="w-full h-8 px-2 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="w-full text-xs h-7" onClick={() => setTimeout(() => onChange(options.map(o => o.value)), 10)}>Todos</Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => { setTimeout(() => onChange([]), 10); setSearch(""); }}>Limpar</Button>
            </div>
          </div>
          {filteredOptions.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={selectedValues.includes(opt.value)}
              onCheckedChange={(checked) => {
                const newValues = checked 
                  ? [...selectedValues, opt.value]
                  : selectedValues.filter((v) => v !== opt.value);
                
                // DEFER parent state update to prevent Radix UI unmount collision during heavy renders
                setTimeout(() => onChange(newValues), 10);
              }}
              onSelect={(e) => e.preventDefault()}
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))}
          {filteredOptions.length === 0 && (
             <div className="px-2 py-2 text-sm text-muted-foreground text-center">Nenhuma opção</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
