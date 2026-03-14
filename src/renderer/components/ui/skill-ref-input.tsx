import { useState, useRef, useEffect, useMemo, useId } from "react"
import { useAtom } from "jotai"
import { skillsAtom } from "@/lib/store"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/cn"

interface SkillRefInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SkillRefInput({ id, value, onChange, placeholder, className }: SkillRefInputProps) {
  const [skills] = useAtom(skillsAtom)
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return skills.slice(0, 12)
    return skills
      .filter((s) => {
        const ref = `${s.category}/${s.name}`.toLowerCase()
        return ref.includes(q) || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      })
      .slice(0, 12)
  }, [skills, value])

  useEffect(() => {
    setFocusIndex(-1)
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const selectSuggestion = (skill: typeof skills[0]) => {
    onChange(`${skill.category}/${skill.name}`)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocusIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocusIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && focusIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[focusIndex])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const showListbox = open && suggestions.length > 0
  const activeOptionId = focusIndex >= 0 ? `${listboxId}-option-${focusIndex}` : undefined

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        type="text"
        role="combobox"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        aria-expanded={showListbox}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
      />
      {showListbox && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Skill suggestions"
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-hairline bg-popover shadow-lg ui-scroll-region"
        >
          {suggestions.map((skill, i) => (
            <div
              key={`${skill.category}/${skill.name}`}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={i === focusIndex}
              className={cn(
                "w-full text-left px-2 py-1.5 text-body-sm ui-transition-colors ui-motion-fast cursor-pointer",
                i === focusIndex ? "bg-accent text-accent-foreground" : "hover:bg-surface-3",
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                selectSuggestion(skill)
              }}
            >
              <span className="font-mono font-medium">{skill.category}/{skill.name}</span>
              {skill.library && (
                <span className="ml-2 ui-meta-text text-muted-foreground">{skill.library}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
