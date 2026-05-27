import { useState, useMemo, forwardRef, memo } from 'react';
import { Check, X, Users, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

interface MultiAssigneeSelectProps {
  profiles: Tables<'profiles'>[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const MultiAssigneeSelect = memo(forwardRef<HTMLButtonElement, MultiAssigneeSelectProps>(({
  profiles,
  selectedIds,
  onChange,
  placeholder = 'Selecionar responsáveis...',
  disabled = false,
  className,
}, ref) => {
  const [open, setOpen] = useState(false);

  const selectedProfiles = useMemo(() => {
    return profiles.filter(p => selectedIds.includes(p.id));
  }, [profiles, selectedIds]);

  const toggleProfile = (profileId: string) => {
    if (selectedIds.includes(profileId)) {
      onChange(selectedIds.filter(id => id !== profileId));
    } else {
      onChange([...selectedIds, profileId]);
    }
  };

  const removeProfile = (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedIds.filter(id => id !== profileId));
  };

  const getDisplayName = (profile: Tables<'profiles'>) => {
    return profile.full_name || profile.email;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between min-h-[40px] h-auto",
            !selectedIds.length && "text-muted-foreground",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1 text-left">
            {selectedProfiles.length > 0 ? (
              selectedProfiles.map(profile => (
                <Badge
                  key={profile.id}
                  variant="secondary"
                  className="mr-1 mb-1"
                >
                  {getDisplayName(profile)}
                  <button
                    type="button"
                    className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    onClick={(e) => removeProfile(profile.id, e)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {placeholder}
              </span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        {open && (
          <Command>
            <CommandInput placeholder="Buscar usuário..." />
            <CommandList>
              <CommandEmpty>Nenhum usuário encontrado.</CommandEmpty>
              <CommandGroup>
                {profiles.map((profile) => (
                  <CommandItem
                    key={profile.id}
                    value={getDisplayName(profile) || profile.id}
                    onSelect={() => toggleProfile(profile.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedIds.includes(profile.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{getDisplayName(profile)}</span>
                      {profile.full_name && (
                        <span className="text-xs text-muted-foreground">
                          {profile.email}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}));

MultiAssigneeSelect.displayName = 'MultiAssigneeSelect';
