import { useEffect, useState } from "react";

interface AnimatedSuggestionInputProps {
  id: string;
  value: string;
  onChange: (next: string) => void;
  suggestions: string[];
}

export function AnimatedSuggestionInput({
  id,
  value,
  onChange,
  suggestions
}: AnimatedSuggestionInputProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (suggestions.length <= 1 || value.trim()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setIsVisible(false);

      window.setTimeout(() => {
        setActiveIndex((current) => (current + 1) % suggestions.length);
        setIsVisible(true);
      }, 180);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [suggestions, value]);

  return (
    <label className="animated-input-shell" htmlFor={id}>
      <input
        id={id}
        className="animated-input-field"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {!value.trim() ? (
        <span className={`animated-input-hint ${isVisible ? "animated-input-hint-visible" : ""}`}>
          {suggestions[activeIndex] ?? ""}
        </span>
      ) : null}
    </label>
  );
}
