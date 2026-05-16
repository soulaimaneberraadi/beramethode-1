
import React, { useLayoutEffect, useRef } from 'react';

interface ExcelInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  containerClassName?: string;
}

export default function ExcelInput({ 
  value, 
  onChange, 
  suggestions, 
  className, 
  containerClassName,
  onBlur,
  onFocus,
  onKeyDown,
  ...props 
}: ExcelInputProps) {
  
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<{ start: number, end: number } | null>(null);

  // Apply cursor selection after render if a suggestion was made
  useLayoutEffect(() => {
    if (cursorRef.current && inputRef.current) {
      inputRef.current.setSelectionRange(cursorRef.current.start, cursorRef.current.end);
      cursorRef.current = null;
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Detect deletion by comparing lengths (simple heuristic for controlled inputs)
    const isDeleting = newValue.length < (value || '').length;

    // If deleting or empty, just update value without suggesting
    if (isDeleting || !newValue) {
        onChange(newValue);
        return;
    }

    // --- Excel-like Autocomplete Logic ---
    // 1. Identify the word being typed (last word)
    const match = newValue.match(/([^\s]+)$/);
    if (!match) {
        onChange(newValue);
        return;
    }
    
    const currentWord = match[1];
    const wordIndex = match.index!;
    
    // Don't suggest for very short words if desired, but Excel does it instantly.
    // We'll require at least 1 char.
    if (currentWord.length < 1) {
        onChange(newValue);
        return;
    }

    // 2. Find case-insensitive match that starts with the current word
    const suggestion = suggestions.find(s => 
        s && s.toLowerCase().startsWith(currentWord.toLowerCase())
    );

    if (suggestion) {
        // 3. Construct full text: Prefix + Suggestion
        const prefix = newValue.substring(0, wordIndex);
        
        // We select the suggestion exactly as it appears in the dictionary
        const completion = prefix + suggestion;
        
        // 4. Determine Selection Range
        // Start: where the user stopped typing (end of newValue)
        // End: end of the full suggested word
        cursorRef.current = {
            start: newValue.length,
            end: completion.length
        };
        
        onChange(completion);
    } else {
        onChange(newValue);
    }
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow 'Tab' or 'Enter' to move cursor to end (accept suggestion)
      if ((e.key === 'Tab' || e.key === 'Enter') && inputRef.current) {
          const { selectionStart, selectionEnd, value } = inputRef.current;
          // If there is an active selection at the end (suggestion active)
          if (selectionStart !== selectionEnd && selectionEnd === value.length) {
              e.preventDefault();
              // Move cursor to end
              inputRef.current.setSelectionRange(value.length, value.length);
              // Add a space for convenience if it's Tab
              if (e.key === 'Tab') {
                  onChange(value + ' ');
              }
              return;
          }
      }
      if (onKeyDown) onKeyDown(e);
  };

  return (
    <div className={`relative w-full ${containerClassName || ''}`}>
      <input
        {...props}
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDownInternal}
        onBlur={onBlur}
        onFocus={onFocus}
        className={`${className} relative z-10 bg-transparent selection:bg-slate-200 selection:text-slate-400`}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck="false"
      />
    </div>
  );
}
