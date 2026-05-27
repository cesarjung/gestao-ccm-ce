import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContentNoPortal,
    PopoverTrigger,
} from "@/components/ui/popover"

export type Option = {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
}

interface MultiSelectProps {
    options: Option[]
    selected: string[]
    onChange: (selected: string[]) => void
    placeholder?: string
    searchPlaceholder?: string
    className?: string
    badgeClassName?: string
    selectAllLabel?: string
    selectedPluralLabel?: string
}

export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder = "Selecionar...",
    searchPlaceholder = "Buscar...",
    className,
    badgeClassName,
    selectAllLabel = "Todos selecionados",
    selectedPluralLabel = "Selecionados",
}: MultiSelectProps) {
    console.log("=== MULTISELECT RENDERIZANDO ===");
    const [open, setOpen] = React.useState(false)

    const selectedOptions = React.useMemo(() => {
        return options.filter((option) => selected.includes(option.value))
    }, [options, selected])

    const handleUnselect = (value: string) => {
        onChange(selected.filter((s) => s !== value))
    }

    const handleSelect = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((s) => s !== value))
        } else {
            onChange([...selected, value])
        }
    }

    const handleSelectAll = () => {
        if (selected.length === options.length) {
            onChange([])
        } else {
            onChange(options.map((o) => o.value))
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between h-auto min-h-10 px-3 py-2 hover:bg-background",
                        className
                    )}
                >
                    <div className="flex-1 overflow-hidden text-left flex items-center pr-2">
                        {selected.length === 0 && (
                            <span className="text-muted-foreground font-normal truncate block w-full">{placeholder}</span>
                        )}
                        {selected.length > 0 && selected.length < options.length && (
                            <span className="text-foreground font-medium truncate block w-full">{selected.length} {selectedPluralLabel}</span>
                        )}
                        {selected.length === options.length && options.length > 0 && (
                            <span className="text-foreground font-medium truncate block w-full">{selectAllLabel}</span>
                        )}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContentNoPortal
                className="w-full p-0"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <Command>
                    <CommandInput placeholder={searchPlaceholder} />
                    <CommandList>
                        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                value="select-all"
                                className="cursor-pointer"
                                onSelect={handleSelectAll}
                            >
                                <div
                                    className={cn(
                                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                        selected.length === options.length
                                            ? "bg-primary text-primary-foreground"
                                            : "opacity-50 [&_svg]:invisible"
                                    )}
                                >
                                    <Check className={cn("h-4 w-4")} />
                                </div>
                                <span>Selecionar Todos</span>
                                <span className="ml-auto text-xs text-muted-foreground">
                                    {selected.length === options.length ? "Limpar" : "Todos"}
                                </span>
                            </CommandItem>
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup className="max-h-64 overflow-auto">
                            {options.map((option) => {
                                const isSelected = selected.includes(option.value)
                                return (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label} // Use label for efficient search
                                        className="cursor-pointer"
                                        onSelect={() => handleSelect(option.value)}
                                    >
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className={cn("h-4 w-4")} />
                                        </div>
                                        {option.icon && (
                                            <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span>{option.label}</span>
                                    </CommandItem>
                                )
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContentNoPortal>
        </Popover>
    )
}
